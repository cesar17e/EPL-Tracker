//Had some error with ts types had to make this file to solve it, you can ignore it

declare module "jsonwebtoken" {
    import * as jwt from "jsonwebtoken";
    export = jwt;
  }
  