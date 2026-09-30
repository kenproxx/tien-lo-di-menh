import {defineConfig} from 'vite';
export default defineConfig({base:'./',server:{host:'0.0.0.0',port:5173,proxy:{'/api':{target:'http://localhost:3001',changeOrigin:false}}},build:{chunkSizeWarningLimit:1600}});
