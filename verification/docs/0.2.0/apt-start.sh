sudo systemctl enable --now lavik
sudo systemctl status lavik --no-pager
sudo apt-get install -y redis-tools
redis-cli -h 127.0.0.1 -p 6379 PING
redis-cli -h 127.0.0.1 -p 6379 SET hello lavik
redis-cli -h 127.0.0.1 -p 6379 GET hello
