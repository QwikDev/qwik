#!/bin/sh

set -e

PREFIX=getting-started
PREV=${PREFIX}_base

git rebase --autosquash $PREV 

for STEP in script component props; do
  echo $PREV "->" ${PREFIX}_$STEP
done