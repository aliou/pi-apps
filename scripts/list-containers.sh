#!/usr/bin/env bash
docker ps -a --filter "name=pi-sandbox-" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}"
