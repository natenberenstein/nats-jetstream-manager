# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm workspace with two application packages. `backend/` contains the NestJS API in `backend/src`, organized by feature modules such as `streams`, `consumers`, `connections`, `metrics`, `jobs`, `kv`, and `objectstore`; DTOs live in each feature's `dto/` folder, and TypeORM entities live in `backend/src/database/entities`. `frontend/` contains the Next.js app in `frontend/src`, with route files under `app/`, shared UI in `components/`, data hooks in `hooks/`, context providers in `contexts/`, and API/types/helpers in `lib/`. Deployment assets are in `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, and `helm/nats-jetstream-manager/`.

## Build, Test, and Development Commands

- `npm install`: install root workspace dependencies.
- `npm run dev`: run backend and frontend concurrently.
- `npm run dev:backend`: start NestJS in watch mode.
- `npm run dev:frontend`: start Next.js locally.
- `npm run build`: build all workspaces.
- `npm run lint`: run ESLint for both workspaces with auto-fix.
- `npm run format:check`: verify Prettier formatting.
- `npm run test --workspace=backend`: run backend Jest tests.
- `docker-compose up -d`: start a local three-node NATS JetStream cluster.

## Coding Style & Naming Conventions

Use TypeScript throughout active source code. Prettier enforces 2-space indentation, semicolons, single quotes, trailing commas, LF endings, and a 100-character print width. Backend files follow NestJS conventions: `*.module.ts`, `*.controller.ts`, `*.service.ts`, and `*.dto.ts`. Frontend React components use PascalCase, hooks use `useXxx`, and shared utilities use descriptive camelCase exports. Avoid `any`; ESLint allows it only as a warning outside tests.

## Testing Guidelines

Backend tests use Jest with `ts-jest`; place specs as `*.spec.ts` under `backend/src` near the code under test. Run `npm run test --workspace=backend` for normal checks and `npm run test:cov --workspace=backend` before larger backend changes. There is no frontend test runner configured yet, so validate frontend changes with `npm run lint --workspace=frontend` and `npm run build --workspace=frontend`.

## Commit & Pull Request Guidelines

Commitlint uses Conventional Commits. Match the existing history with messages such as `feat: add stream detail view`, `refactor: simplify code`, or `fix: handle connection timeout`. Pull requests should include a concise summary, validation commands run, linked issues when applicable, and screenshots or recordings for visible UI changes.

## Security & Configuration Tips

Do not commit credentials, tokens, NATS secrets, or database URLs. Configure the backend with environment variables such as `CORS_ORIGINS`, `DATABASE_DRIVER`, `DATABASE_PATH`, and `DATABASE_URL`; configure the frontend with `NEXT_PUBLIC_API_URL`.
