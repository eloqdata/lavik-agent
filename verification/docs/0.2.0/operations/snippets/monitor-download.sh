# Use a new directory on the Linux host that will run monitoring.
mkdir lavik-monitoring-stable
cd lavik-monitoring-stable
curl -fL https://github.com/eloqdata/lavik/archive/2908f86f2770e9c6e8acc6585b3bedb4b44d1cd5.tar.gz -o source.tar.gz
(
# These upstream configuration files contain no credentials.
# Containers run as other users and need readable files/traversable directories.
umask 022
tar --no-same-permissions -xzf source.tar.gz --strip-components=3 \
  lavik-2908f86f2770e9c6e8acc6585b3bedb4b44d1cd5/deploy/monitoring
)
