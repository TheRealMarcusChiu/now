#! /bin/bash
# Deploy new code to the server while the log server keeps appending.
#
# The server writes to data/ constantly and only commits every ~30s, so the
# working tree usually has unstaged changes. `--autostash` stashes them,
# rebases, and restores them — no manual commit/stash needed, nothing lost.
# `-T` silences the "pseudo-terminal will not be allocated" warning.

ssh -T my-websites << 'EOF'
  set -e
  cd /root/now
  git pull --rebase --autostash
  systemctl restart now-admin.service
EOF
