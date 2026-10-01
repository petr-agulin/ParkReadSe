# Screenshots

The phones in the main README's **Screenshots** section: rows of three, in the same
drawn phone as the picture at the top. Each is made from a screenshot taken on a phone,
portrait, in Chrome:

    npm run readme:phone -- <screenshot>... --out images/screenshots/NN-name.svg \
        --width 720 --time 22:21 --trim-top 253 --trim-bottom 131 \
        --title "..." --desc "..."

**Every phone in the gallery is shown the same size:** `width="240"` on the image, in a
cell of `width="33%"`, three to a row. Three 240-pixel phones fit GitHub's column; at
260 they did not, GitHub squeezed the columns unevenly, and the phone with the longest
caption came out larger than its neighbours.

`--trim-top` and `--trim-bottom` cut Chrome's address bar and the phone's buttons off a
1080×2400 screenshot. A screen longer than the phone is given as several screenshots,
each overlapping the one before, and scrolls; one that fits stands still.

| File | What it shows |
|---|---|
| `01-first-launch.svg` | the first launch, before any key is set |
| `02-settings.svg` | Settings: key (hidden), provider and model |
| `03-home.svg` | the home screen, ready to read a sign |
| `04-scan-a-sign.svg` | row two, first: the camera, a sign inside the aiming frame. Test photo `012` (the developer's own, no plates or faces) was put into the viewfinder of a camera screenshot, cropped and dimmed outside the frame as the camera shows it |
| `../readme-main.svg` | row two, second: the sign reading, scrolling — the same file as the picture at the top of the README, shown at the gallery's size, so it is downloaded once |
| `05-no-parking-zone.svg` | row two, third: the reading of a no-parking zone sign, scrolling — joined from three screenshots |

**Use your own photos of signs.** No number plates, no faces, no names on doors in the
frame, and no Street View images: those are not yours to publish.
