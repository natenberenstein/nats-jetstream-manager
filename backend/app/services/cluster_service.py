"""Service for cluster overview and topology insights."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.connection_manager import ConnectionInfo


class ClusterService:
    """Aggregates cluster-level data from NATS and JetStream APIs."""

    @staticmethod
    def _extract_limits(account_info: Any) -> dict[str, int | None] | None:
        limits = getattr(account_info, "limits", None)
        if not limits:
            return None

        return {
            "max_memory": getattr(limits, "max_memory", None),
            "max_storage": getattr(limits, "max_storage", None),
            "max_streams": getattr(limits, "max_streams", None),
            "max_consumers": getattr(limits, "max_consumers", None),
            "max_ack_pending": getattr(limits, "max_ack_pending", None),
            "memory_max_stream_bytes": getattr(limits, "memory_max_stream_bytes", None),
            "storage_max_stream_bytes": getattr(limits, "storage_max_stream_bytes", None),
        }

    @staticmethod
    async def get_overview(conn_info: ConnectionInfo) -> dict[str, Any]:
        """Return a cluster overview payload suitable for UI dashboards."""
        nc = conn_info.nc
        account_info = await conn_info.js.account_info()

        stream_infos = await conn_info.js.streams_info()

        stream_count = 0
        consumer_count = 0
        total_messages = 0
        total_bytes = 0

        nodes_by_name: dict[str, dict[str, Any]] = {}
        stream_health: list[dict[str, Any]] = []
        warnings: list[str] = []
        caveats: list[str] = []
        sources: list[str] = ["JetStream account_info", "JetStream streams_info"]
        has_replica_metadata = False
        quorum_degraded_streams = 0
        leaderless_streams = 0

        for stream_info in stream_infos:
            stream_count += 1
            state = stream_info.state
            config = stream_info.config

            consumer_count += state.consumer_count
            total_messages += state.messages
            total_bytes += state.bytes

            cluster = getattr(stream_info, "cluster", None)
            leader = getattr(cluster, "leader", None) if cluster else None
            replicas = list(getattr(cluster, "replicas", None) or [])
            if leader or replicas:
                has_replica_metadata = True
            replicas_expected = int(getattr(config, "num_replicas", 1) or 1)

            offline_replicas = 0
            lagging_replicas = 0

            if leader:
                node = nodes_by_name.setdefault(
                    leader,
                    {
                        "name": leader,
                        "role": "leader",
                        "current": True,
                        "offline": False,
                        "lag": 0,
                        "active": None,
                    },
                )
                node["role"] = "leader"

            for peer in replicas:
                peer_name = getattr(peer, "name", "unknown")
                peer_offline = bool(getattr(peer, "offline", False))
                peer_current = bool(getattr(peer, "current", False))
                peer_lag = int(getattr(peer, "lag", 0) or 0)
                peer_active = getattr(peer, "active", None)

                if peer_offline:
                    offline_replicas += 1
                if peer_lag > 0:
                    lagging_replicas += 1

                existing = nodes_by_name.get(peer_name)
                if existing:
                    existing["offline"] = bool(existing.get("offline", False) or peer_offline)
                    existing["current"] = bool(existing.get("current", False) or peer_current)
                    existing["lag"] = max(int(existing.get("lag", 0) or 0), peer_lag)
                    if existing.get("role") != "leader":
                        existing["role"] = "replica"
                else:
                    nodes_by_name[peer_name] = {
                        "name": peer_name,
                        "role": "replica",
                        "current": peer_current,
                        "offline": peer_offline,
                        "lag": peer_lag,
                        "active": peer_active,
                    }

            online_replicas = max(0, len(replicas) - offline_replicas)
            if leader:
                online_replicas += 1
            quorum_target = (replicas_expected // 2) + 1
            has_quorum = online_replicas >= quorum_target
            if not has_quorum:
                quorum_degraded_streams += 1
                warnings.append(
                    f"Stream {config.name} is below quorum ({online_replicas}/{replicas_expected})"
                )
            if replicas_expected > 1 and not leader:
                leaderless_streams += 1
                warnings.append(f"Stream {config.name} has no detected leader")

            healthy = offline_replicas == 0 and lagging_replicas == 0
            if not healthy:
                warnings.append(
                    f"Stream {config.name} has {offline_replicas} offline and {lagging_replicas} lagging replicas"
                )

            stream_health.append(
                {
                    "stream": config.name,
                    "replicas": replicas_expected,
                    "leader": leader,
                    "replicas_seen": len(replicas),
                    "online_replicas": online_replicas,
                    "has_quorum": has_quorum,
                    "offline_replicas": offline_replicas,
                    "lagging_replicas": lagging_replicas,
                    "healthy": healthy,
                }
            )

        connected_url = getattr(nc, "connected_url", None)
        connected_server = str(connected_url) if connected_url else None
        server_version = str(getattr(nc, "connected_server_version", "")) or None

        discovered_servers = list(getattr(nc, "discovered_servers", []) or [])
        configured_servers = list(getattr(nc, "servers", []) or [])
        discovered_server_urls = [str(s) for s in discovered_servers]
        configured_server_urls = [str(s) for s in configured_servers]
        if discovered_servers:
            sources.append("NATS discovered_servers")
        if configured_servers:
            sources.append("NATS configured seed servers")

        discovered_count = len(discovered_servers)
        configured_count = len(configured_servers)
        observed_node_count = len(nodes_by_name)

        node_count = max(observed_node_count, discovered_count, configured_count, 1)
        topology = "standalone" if node_count <= 1 else "clustered"

        if discovered_count > configured_count:
            warnings.append("Discovered more servers than configured seed URLs")

        if any(bool(node.get("offline", False)) for node in nodes_by_name.values()):
            warnings.append("One or more replica nodes are offline")

        if any(int(node.get("lag", 0) or 0) > 0 for node in nodes_by_name.values()):
            warnings.append("One or more replica nodes are lagging")

        js_api = getattr(account_info, "api", None)
        limits = ClusterService._extract_limits(account_info)

        server_info = getattr(nc, "_server_info", None)
        cluster_name = None
        route_count = 0
        gateway_count = 0
        leafnode_count = 0
        if isinstance(server_info, dict):
            cluster_name = server_info.get("cluster") or server_info.get("server_name")
            sources.append("NATS server_info")
            routes = server_info.get("connect_urls")
            if isinstance(routes, list):
                route_count = len(routes)
            gateways = server_info.get("gateway_urls")
            if isinstance(gateways, list):
                gateway_count = len(gateways)
            leafnodes = server_info.get("leafnode_urls")
            if isinstance(leafnodes, list):
                leafnode_count = len(leafnodes)

        if stream_count == 0:
            caveats.append("No streams found, so node and replication health are limited.")
        if not has_replica_metadata:
            caveats.append("Replica placement metadata unavailable; topology is inferred.")
        if not cluster_name:
            caveats.append("Cluster name not provided by the connected server.")

        confidence = "medium"
        if has_replica_metadata:
            confidence = "high"
        elif discovered_count == 0 and configured_count <= 1:
            confidence = "low"

        overview: dict[str, Any] = {
            "topology": topology,
            "cluster_name": cluster_name,
            "connected_server": connected_server,
            "server_version": server_version,
            "mixed_versions": False,
            "node_count": node_count,
            "discovered_servers": discovered_server_urls,
            "configured_servers": configured_server_urls,
            "route_count": route_count,
            "gateway_count": gateway_count,
            "leafnode_count": leafnode_count,
            "nodes": sorted(nodes_by_name.values(), key=lambda n: n["name"]),
            "stream_count": stream_count,
            "consumer_count": consumer_count,
            "messages": total_messages,
            "bytes": total_bytes,
            "js_domain": getattr(account_info, "domain", None),
            "js_api_total": getattr(js_api, "total", None) if js_api else None,
            "js_api_errors": getattr(js_api, "errors", None) if js_api else None,
            "limits": limits,
            "confidence": confidence,
            "sources": sorted(set(sources)),
            "caveats": caveats,
            "warnings": sorted(set(warnings)),
            "quorum_degraded_streams": quorum_degraded_streams,
            "leaderless_streams": leaderless_streams,
            "stream_health": sorted(stream_health, key=lambda s: s["stream"]),
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        return overview
