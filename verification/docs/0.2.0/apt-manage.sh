sudo journalctl -u lavik -n 50 --no-pager
sudo systemctl restart lavik
redis-cli -h 127.0.0.1 -p 6379 GET hello
# Stop the server without removing its package or data.
sudo systemctl stop lavik
