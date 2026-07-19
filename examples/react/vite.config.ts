import react from "@vitejs/plugin-react";
import { defineBrandConfig } from "vite-plugin-white-label";

export default defineBrandConfig({}, { plugins: [react()] });
