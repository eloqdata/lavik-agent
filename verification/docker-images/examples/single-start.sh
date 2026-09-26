docker pull eloqdata/lavik:0.1.0-beta.1
docker run -d --name lavik \
  --security-opt seccomp=unconfined \
  --stop-timeout 60 \
  -p 127.0.0.1:6379:6379 \
  -v lavik-data:/data \
  eloqdata/lavik:0.1.0-beta.1
