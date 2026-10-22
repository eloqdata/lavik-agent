# For an existing configured APT installation; back up data first.
sudo apt-get update
sudo apt-get install --only-upgrade 'lavik=0.2.0-1'
# Use lavik-standard=0.2.0-1 instead if that is your installed variant.
lavik --version
