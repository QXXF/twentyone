import "./style.css";
import { mount } from "./ui.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Manca #app");
mount(root);
