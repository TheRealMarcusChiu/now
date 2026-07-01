#! /bin/bash

ssh my-websites << EOF
  cd /root/now
  git pull --rebase
  systemctl restart now-admin.service
EOF
