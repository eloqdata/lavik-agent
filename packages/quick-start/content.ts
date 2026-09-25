import { downloadPackages } from "../content/downloads";

export const quickStartPackages = downloadPackages.map((pkg) => ({
  ...pkg,
  directory: pkg.filename.slice(0, -7),
  commands: `${pkg.commands} &&\ncd ${pkg.filename.slice(0, -7)} &&\n./lavik --version`,
}));

export const quickStartDependencies = {
  minimal:
    "sudo apt-get update &&\nsudo apt-get install -y ca-certificates curl redis-tools",
  standard:
    "sudo apt-get update &&\nsudo apt-get install -y ca-certificates curl redis-tools libnuma1 libuuid1",
};
