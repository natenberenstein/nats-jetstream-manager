# NATS JetStream Manager - Frontend

Next.js frontend for managing NATS JetStream clusters.

## Features

- **Modern UI**: Built with Next.js 14, React 18, and Tailwind CSS
- **Real-time Updates**: Auto-refresh stream and consumer statistics
- **Type-Safe**: Full TypeScript support
- **Responsive Design**: Works on desktop and mobile
- **Dark Mode**: Built-in dark mode support

## Quick Start

### Prerequisites

- Node.js 20+
- Backend API running (see `/backend`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```bash
cp .env.local.example .env.local
```

3. Update the API URL in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

4. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Using Docker

Build and run with Docker:
```bash
docker build -t nats-manager-frontend .
docker run -p 3000:3000 nats-manager-frontend
```

## Project Structure

```
src/
├── app/                  # Next.js app router pages
│   ├── dashboard/        # Dashboard pages
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/           # React components
│   ├── forms/            # Form components
│   ├── tables/           # Table components
│   └── ui/               # UI components
├── contexts/             # React contexts
│   └── ConnectionContext.tsx
├── hooks/                # Custom React hooks
├── lib/                  # Utilities
│   ├── api.ts            # API client
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Utility functions
```

## Key Technologies

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first CSS
- **TanStack Query**: Data fetching and caching
- **TanStack Table**: Advanced tables
- **React Hook Form**: Form handling
- **Zod**: Schema validation
- **Lucide React**: Icons

## Development

### Code Style

Format code:
```bash
npm run lint
```

### Building for Production

```bash
npm run build
npm start
```

## Environment Variables

- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8000)

## License

MIT
