# Use a new directory on the Linux host that will run monitoring.
mkdir lavik-monitoring-stable
cd lavik-monitoring-stable
curl -fL https://github.com/eloqdata/lavik/archive/feb61224e414c5653fd09560e20c9d214db1e3ac.tar.gz -o source.tar.gz
(
# These upstream configuration files contain no credentials.
# Containers run as other users and need readable files/traversable directories.
umask 022
tar --no-same-permissions -xzf source.tar.gz --strip-components=3 \
  lavik-feb61224e414c5653fd09560e20c9d214db1e3ac/deploy/monitoring
)
