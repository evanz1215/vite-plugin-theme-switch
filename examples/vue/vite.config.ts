import vue from "@vitejs/plugin-vue";
import { defineBrandConfig } from "vite-plugin-white-label";

export default defineBrandConfig({}, () => ({
  plugins: [vue()],
}));
