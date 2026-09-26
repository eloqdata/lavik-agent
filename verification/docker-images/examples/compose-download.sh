mkdir -p lavik-compose
cd lavik-compose
curl --fail --location --output compose.yaml \
  https://raw.githubusercontent.com/eloqdata/lavik/a1770a78b52e0bb9ec32e20b92af6282e73efabd/deploy/docker/compose.yaml
curl --fail --location --output cluster.toml \
  https://raw.githubusercontent.com/eloqdata/lavik/a1770a78b52e0bb9ec32e20b92af6282e73efabd/deploy/docker/cluster.toml
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose logs -f bootstrap
