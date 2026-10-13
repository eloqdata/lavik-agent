mkdir lavik-0.1.0-cluster && cd lavik-0.1.0-cluster
curl -fLO --retry 3 https://raw.githubusercontent.com/eloqdata/lavik-agent/3341d7d86ade7744bd0631c0feca9fa683cf25e4/packaging/docker/0.1.0/compose.yaml &&
printf '%s\n' 'b28515b59097da99ec485ca54767957109619d7387cd3cc3266b388992de7453  compose.yaml' | sha256sum -c -
curl -fLO --retry 3 https://raw.githubusercontent.com/eloqdata/lavik-agent/3341d7d86ade7744bd0631c0feca9fa683cf25e4/packaging/docker/0.1.0/cluster.toml &&
printf '%s\n' '8810dacc1849ae707d17ceb450d10c2bb8e925c3fc3a609004a94dd4c96a846d  cluster.toml' | sha256sum -c -
