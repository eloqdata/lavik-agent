docker pull eloqdata/lavik:0.1.0
docker run -d --name lavik   --security-opt seccomp=unconfined   --ulimit memlock=536870912:536870912   -p 127.0.0.1:6379:6379   -v lavik-data:/data   -e LAVIK_DATA_SIZE=1G -e LAVIK_THREADS=2   eloqdata/lavik:0.1.0
