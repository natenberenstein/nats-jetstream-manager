# Changelog

## [1.2.0](https://github.com/natenberenstein/nats-jetstream-manager/compare/nats-jetstream-manager-v1.1.0...nats-jetstream-manager-v1.2.0) (2026-05-06)


### Features

* add problem dashboard diagnostics ([83b0512](https://github.com/natenberenstein/nats-jetstream-manager/commit/83b0512102e4e4b442633424a135816193d298da))

## [1.1.0](https://github.com/natenberenstein/nats-jetstream-manager/compare/nats-jetstream-manager-v1.0.0...nats-jetstream-manager-v1.1.0) (2026-05-06)


### Features

* add audit page ([4e9caa7](https://github.com/natenberenstein/nats-jetstream-manager/commit/4e9caa727f4b1da214daac0b95a6025d9d7828c7))
* add feature for adding kv store and object store ([a689aae](https://github.com/natenberenstein/nats-jetstream-manager/commit/a689aae974a0956309659c9ad3d25f6b3bff8dcf))
* add jetstream dashboard to allow developers to perform operations on streams and consumers, add diff viewer, message viewer, and etc. ([df5839a](https://github.com/natenberenstein/nats-jetstream-manager/commit/df5839a5729bb30251b7a0130cae81e928149365))
* add metrics, health, and audit log pages ([12d086c](https://github.com/natenberenstein/nats-jetstream-manager/commit/12d086c51b0a1785f101be1802efc2847f925779))
* add stream detail view page, dark mode, search/filter search for streams and other features ([c83acea](https://github.com/natenberenstein/nats-jetstream-manager/commit/c83aceacbf515751650703f599512778a5763fcd))
* **db:** migrate to SQLAlchemy ORM with PostgreSQL support ([022f4dd](https://github.com/natenberenstein/nats-jetstream-manager/commit/022f4dd659ffae3b9feb4caae2599ea278bff173))
* simplify Streams page, remove unused pages, improve cluster info, and others ([5a66d1d](https://github.com/natenberenstein/nats-jetstream-manager/commit/5a66d1d6acc45100c36ee2a9b947bc0f112f87d5))


### Bug Fixes

* **messages:** resolve infinite render loop causing maximum update depth exceeded ([b10c65b](https://github.com/natenberenstein/nats-jetstream-manager/commit/b10c65be848a04a2a120c108161fab1af53e03c5))
