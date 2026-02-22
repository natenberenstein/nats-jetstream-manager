"""Connection manager for handling multiple NATS connections."""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional

import nats
from nats.js import JetStreamContext

logger = logging.getLogger(__name__)


class ConnectionInfo:
    """Information about a NATS connection."""

    def __init__(
        self,
        connection_id: str,
        url: str,
        nc: nats.NATS,
        js: JetStreamContext,
        created_at: datetime,
    ):
        self.connection_id = connection_id
        self.url = url
        self.nc = nc
        self.js = js
        self.created_at = created_at
        self.last_accessed = created_at

    def update_access(self):
        """Update the last accessed timestamp."""
        self.last_accessed = datetime.utcnow()


class ConnectionManager:
    """Manages multiple NATS connections with automatic cleanup."""

    def __init__(self, max_connections: int = 100, timeout_seconds: int = 300):
        self.connections: Dict[str, ConnectionInfo] = {}
        self.max_connections = max_connections
        self.timeout_seconds = timeout_seconds
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the connection manager and cleanup task."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Connection manager started")

    async def stop(self):
        """Stop the connection manager and close all connections."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Close all connections
        async with self._lock:
            for conn_info in list(self.connections.values()):
                await self._close_connection(conn_info)
            self.connections.clear()

        logger.info("Connection manager stopped")

    async def create_connection(
        self,
        url: str,
        user: Optional[str] = None,
        password: Optional[str] = None,
        token: Optional[str] = None,
    ) -> str:
        """
        Create a new NATS connection.

        Args:
            url: NATS server URL
            user: Optional username
            password: Optional password
            token: Optional authentication token

        Returns:
            Connection ID (UUID)

        Raises:
            ConnectionError: If connection fails
            ValueError: If max connections reached
        """
        async with self._lock:
            if len(self.connections) >= self.max_connections:
                raise ValueError(f"Maximum connections ({self.max_connections}) reached")

            connection_id = str(uuid.uuid4())

            try:
                # Create NATS connection
                nc = await nats.connect(
                    servers=url,
                    user=user,
                    password=password,
                    token=token,
                    error_cb=self._error_handler,
                    disconnected_cb=self._disconnected_handler,
                    reconnected_cb=self._reconnected_handler,
                )

                # Get JetStream context
                js = nc.jetstream()

                # Store connection info
                conn_info = ConnectionInfo(
                    connection_id=connection_id, url=url, nc=nc, js=js, created_at=datetime.utcnow()
                )
                self.connections[connection_id] = conn_info

                logger.info(f"Created connection {connection_id} to {url}")
                return connection_id

            except Exception as e:
                logger.error(f"Failed to connect to {url}: {e}")
                raise ConnectionError(f"Failed to connect to NATS: {str(e)}")

    async def get_connection(self, connection_id: str) -> ConnectionInfo:
        """
        Get a connection by ID.

        Args:
            connection_id: Connection ID

        Returns:
            ConnectionInfo object

        Raises:
            KeyError: If connection not found
        """
        async with self._lock:
            if connection_id not in self.connections:
                raise KeyError(f"Connection {connection_id} not found")

            conn_info = self.connections[connection_id]
            conn_info.update_access()
            return conn_info

    async def remove_connection(self, connection_id: str) -> bool:
        """
        Remove and close a connection.

        Args:
            connection_id: Connection ID

        Returns:
            True if connection was removed, False if not found
        """
        async with self._lock:
            if connection_id in self.connections:
                conn_info = self.connections[connection_id]
                await self._close_connection(conn_info)
                del self.connections[connection_id]
                logger.info(f"Removed connection {connection_id}")
                return True
            return False

    async def test_connection(
        self,
        url: str,
        user: Optional[str] = None,
        password: Optional[str] = None,
        token: Optional[str] = None,
    ) -> Dict:
        """
        Test a NATS connection without storing it.

        Args:
            url: NATS server URL
            user: Optional username
            password: Optional password
            token: Optional authentication token

        Returns:
            Dict with connection test results
        """
        nc = None
        try:
            # Attempt connection
            nc = await nats.connect(
                servers=url,
                user=user,
                password=password,
                token=token,
            )

            # Check if JetStream is enabled
            try:
                js = nc.jetstream()
                account_info = await js.account_info()
                jetstream_enabled = True
                server_info = {
                    "memory": account_info.memory,
                    "storage": account_info.storage,
                    "streams": account_info.streams,
                    "consumers": account_info.consumers,
                }
            except Exception as js_error:
                logger.warning(f"JetStream not available: {js_error}")
                jetstream_enabled = False
                server_info = {}

            return {
                "success": True,
                "connected": nc.is_connected,
                "jetstream_enabled": jetstream_enabled,
                "server_info": server_info,
            }

        except Exception as e:
            logger.error(f"Connection test failed for {url}: {e}")
            return {
                "success": False,
                "error": str(e),
                "jetstream_enabled": False,
                "server_info": {},
            }
        finally:
            if nc and nc.is_connected:
                await nc.drain()

    async def get_connection_status(self, connection_id: str) -> Dict:
        """
        Get the status of a connection.

        Args:
            connection_id: Connection ID

        Returns:
            Dict with connection status
        """
        try:
            conn_info = await self.get_connection(connection_id)

            # Check JetStream
            jetstream_enabled = True
            try:
                await conn_info.js.account_info()
            except Exception:
                jetstream_enabled = False

            return {
                "connected": conn_info.nc.is_connected,
                "jetstream_enabled": jetstream_enabled,
                "url": conn_info.url,
                "created_at": conn_info.created_at.isoformat(),
                "last_accessed": conn_info.last_accessed.isoformat(),
            }
        except KeyError:
            return {"connected": False, "error": "Connection not found"}

    async def list_connections(self) -> list[Dict]:
        """List all active managed connections."""
        async with self._lock:
            items: list[Dict] = []
            for conn_id, conn_info in self.connections.items():
                jetstream_enabled = True
                try:
                    await conn_info.js.account_info()
                except Exception:
                    jetstream_enabled = False
                items.append(
                    {
                        "connection_id": conn_id,
                        "url": conn_info.url,
                        "connected": conn_info.nc.is_connected,
                        "jetstream_enabled": jetstream_enabled,
                        "created_at": conn_info.created_at.isoformat(),
                        "last_accessed": conn_info.last_accessed.isoformat(),
                    }
                )
            return items

    async def _close_connection(self, conn_info: ConnectionInfo):
        """Close a NATS connection gracefully."""
        try:
            if conn_info.nc.is_connected:
                await conn_info.nc.drain()
            logger.debug(f"Closed connection {conn_info.connection_id}")
        except Exception as e:
            logger.error(f"Error closing connection {conn_info.connection_id}: {e}")

    async def _cleanup_loop(self):
        """Periodically clean up stale connections."""
        while True:
            try:
                await asyncio.sleep(60)  # Run every minute
                await self._cleanup_stale_connections()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    async def _cleanup_stale_connections(self):
        """Remove connections that haven't been accessed recently."""
        async with self._lock:
            now = datetime.utcnow()
            stale_ids = []

            for conn_id, conn_info in self.connections.items():
                age = (now - conn_info.last_accessed).total_seconds()
                if age > self.timeout_seconds:
                    stale_ids.append(conn_id)

            for conn_id in stale_ids:
                conn_info = self.connections[conn_id]
                await self._close_connection(conn_info)
                del self.connections[conn_id]
                logger.info(f"Cleaned up stale connection {conn_id}")

    @staticmethod
    async def _error_handler(error):
        """Handle NATS errors."""
        logger.error(f"NATS error: {error}")

    @staticmethod
    async def _disconnected_handler():
        """Handle disconnection."""
        logger.warning("Disconnected from NATS")

    @staticmethod
    async def _reconnected_handler():
        """Handle reconnection."""
        logger.info("Reconnected to NATS")


# Global connection manager instance
connection_manager = ConnectionManager()
