# COPKU v1.39 — general MSCZ note tracking correction

This is an update-only package over v1.38. The fixes use the score structure
and native playback data. No filename, composer or piece-specific rule is used.

## Install

1. Extract the update ZIP.
2. Merge its contents into your existing complete orchestra website folder.
   Replace matching files and keep all other existing files, including the
   MuseScore engine, fonts and SoundFont.
3. Upload the resulting complete folder to your existing Netlify website.
   The small patch ZIP alone is not a complete website.
4. Refresh the portal. If needed, use Ctrl+Shift+R on Windows or Command+Shift+R
   on Mac. Close an already-open score window and reopen its Preview.

No Supabase, Stripe, Brevo or email configuration is required.

## What changed

- Large scores are prepared by assembling the marked score once. The previous
  implementation copied the entire score again for every note and could time
  out on ordinary ensemble scores.
- Grace notes no longer disable highlighting for the entire score. Before-
  and after-grace ownership comes from native MSCX, because MusicXML does not
  preserve every distinction. Principal-note delays and after-grace gates use
  actual MIDI timing when available.
- A grace note with no separate positive-duration native playback event stays
  clickable at its associated beat. The player does not invent an audio
  duration for it. Some muted or unusual notes follow their written rhythm.
- Single- and two-note tremolos use their actual repeated attacks. In a
  two-note tremolo, the second head can sound before its written position.
- Transposing instruments, percussion, multiple staves and reused MIDI channels
  are kept separate by staff track and MIDI port.
- A multi-measure rest can occupy one layout box while retaining several
  musical measures. Page mapping now handles this grouping.
- The timeline follows the bundled MP3 exporter's actual single-pass order.
  Its metadata and repeat-expanded MIDI can describe a longer performance
  than its exported audio. The player no longer uses that incompatible order
  or stretches note times over the audio's ending silence. The generated
  audio itself retains the existing single-pass behavior.
- An unsupported individual notation detail or glyph does not disable the
  rest of the score. A page-specific issue keeps other pages and audio usable.

Highlighting, click-note seeking, playback speed and automatic page following
remain available. Scores stay in the browser; no external conversion service
is used. The original file and engraving are preserved.

## Validation and practical limits

The supplied 12-page concert-band score passed checks for every rendered
notehead: each has a seek target on its correct page. The mapping contains
6,635 timed events and 54 zero-duration grace beat anchors. Preparation took
about 6.6 seconds in the test environment; device speed will vary.

Independent original fixtures also passed for tempo changes, chords, ties,
before- and after-graces, delayed principal notes, trills, single/two-note
tremolos, transposing clarinet, percussion, channel reuse across ports and
compressed multi-measure rests. Native-engine and controller tests verify
seeking, anchors, timing, audio isolation, cleanup and audible playback.

The correction applies generally to valid MSCZ files supported by the bundled
MuseScore engine. The existing 10 MB upload, expanded-size and engine-format
limits still apply. It cannot guarantee damaged files or formats newer than
the bundled engine. Unsupported details retain the normal score/audio view
and original download.

Browser visual QA remains unavailable in this environment: the managed
preview service is absent and the private hosted review page requires sign-in.
The separate email website is unchanged.
