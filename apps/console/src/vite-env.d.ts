/// <reference types="vite/client" />
declare module '*.css';

// Injected at build time by vite.config.ts `define`.
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
