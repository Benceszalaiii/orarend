// @ts-check
import { module } from "@prisma/composer";
import orarendService from "./service.mjs";

export default module("orarend", ({ provision }) => {
  provision(orarendService);
});
