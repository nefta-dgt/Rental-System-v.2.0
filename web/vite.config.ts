import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Panggilan /api diteruskan ke server v2 saat pengembangan
    proxy: { '/api': 'http://localhost:3200' },
  },
})
