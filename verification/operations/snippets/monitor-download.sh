# Use a new directory on the Linux host that will run monitoring.
mkdir lavik-monitoring-beta1
cd lavik-monitoring-beta1
curl -fL https://github.com/eloqdata/lavik/archive/3955b98d43b312324aa8d52775df52cfb111c0d0.tar.gz -o source.tar.gz
(
# These upstream configuration files contain no credentials.
# Containers run as other users and need readable files/traversable directories.
umask 022
tar --no-same-permissions -xzf source.tar.gz --strip-components=3 \
  lavik-3955b98d43b312324aa8d52775df52cfb111c0d0/deploy/monitoring
)
