@echo off
git --git-dir="%~dp0.git-private" --work-tree="%~dp0." %*
