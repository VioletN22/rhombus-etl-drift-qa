#!/bin/zsh
# Record the screen area below the menu bar (where the recording Chrome window sits).
#   scripts/rec.sh start <name>   scripts/rec.sh stop
cd "${0:A:h}/.."
case $1 in
  start) mkdir -p recordings/raw
         nohup ffmpeg -hide_banner -loglevel error -y -f avfoundation -framerate 30 -capture_cursor 1 \
           -capture_mouse_clicks 1 -i "4:none" -vf "crop=3024:1898:0:66" -c:v h264_videotoolbox -b:v 8M \
           "recordings/raw/$2.mp4" >/dev/null 2>&1 &
         echo "recording recordings/raw/$2.mp4" ;;
  stop)  pkill -INT -f "avfoundation" && sleep 2 && ls -la recordings/raw | tail -3 ;;
esac
