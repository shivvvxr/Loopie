import worker from "./worker.mjs";
import { createNodeHandler } from "./node-adapter.mjs";
export default createNodeHandler(worker);
