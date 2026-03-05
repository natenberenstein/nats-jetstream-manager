from __future__ import annotations

from sqlalchemy import Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StreamMetric(Base):
    __tablename__ = "stream_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[str]
    stream_name: Mapped[str]
    messages: Mapped[int] = mapped_column(default=0)
    bytes: Mapped[int] = mapped_column(default=0)
    consumer_count: Mapped[int] = mapped_column(default=0)
    collected_at: Mapped[str]


Index("idx_stream_metrics_conn_stream", StreamMetric.connection_id, StreamMetric.stream_name, StreamMetric.collected_at)
