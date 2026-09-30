#!/bin/zsh
cd "${0:A:h}"
open 'http://127.0.0.1:4180/'
python3 -m http.server 4180 --bind 127.0.0.1
