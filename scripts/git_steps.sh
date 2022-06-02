#!/bin/sh

set -e

PREFIX=getting-started
PREV=${PREFIX}_base

git rebase -i --autosquash $PREV 

git tag getting-started_script HEAD~7 -f
git tag getting-started_component HEAD~6 -f
git tag getting-started_props HEAD~5 -f
git tag getting-started_store HEAD~4 -f
git tag getting-started_listener HEAD~3 -f
git tag getting-started_watch HEAD~2 -f
git tag getting-started_ssr HEAD~1 -f
git tag getting-started_styling HEAD -f


echo ==============================
git log --oneline
