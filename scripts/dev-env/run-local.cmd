@echo off

rem This is a script to use a locally build docker image to run the tests

set image="sha256:195bb342c9aac0f0151d2289d1b56340813ec96aeb56ed607598f5e7929a0534"

docker image inspect %image% 1> nul || docker system prune --filter label=flybywiresim=true -f
docker run --rm -it -v "%cd%:/external" %image% %*
