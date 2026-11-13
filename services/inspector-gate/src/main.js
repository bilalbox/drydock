import { startGate } from "./server.js";

const port = Number(process.env.PORT ?? 4502);
const origin = process.env.FLOCI_UI_ORIGIN ?? "http://floci-ui:4500";
startGate({ origin, port });
console.log(`inspector gate listening on ${port}, upstream ${origin}`);
