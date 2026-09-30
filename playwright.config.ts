import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:45000,use:{baseURL:'http://localhost:5173',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:'list',workers:1});
