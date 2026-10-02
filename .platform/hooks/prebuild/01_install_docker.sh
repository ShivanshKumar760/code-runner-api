#!/bin/bash
set -e

# Read the APP_ROLE environment property of this Beanstalk environment
ROLE=$(/opt/elasticbeanstalk/bin/get-config environment -k APP_ROLE 2>/dev/null || true)
if [ "$ROLE" != "worker" ]; then
  echo "APP_ROLE=$ROLE -> Docker not needed"
  exit 0
fi

command -v docker >/dev/null || dnf install -y docker
systemctl enable --now docker

# Members of the 'docker' group may use /var/run/docker.sock
usermod -aG docker webapp