# Run in a second terminal on the migration host.
curl --fail --silent --show-error http://127.0.0.1:18080/status \
  | python3 -m json.tool
