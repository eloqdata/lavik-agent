# Lavik 0.2.0 container build

Build from the checksum-verified official Minimal release archives.
These are local image tags; no public 0.2.0 registry tag is assumed.

```sh
docker build --target single -t lavik:0.2.0 .
docker build --target cluster -t lavik:0.2.0-cluster .
```

Use the versioned Docker and Compose guides at https://lavik.dev/en/docs/0.2.0/.
