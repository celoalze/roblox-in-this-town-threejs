# Format: in_this_world (world rule + named hero + planted clues + emotional twist)

Reference: 8 videos in `.references/new` (1M+ views each): The Timer, The Exam, The Price Tag, Aliens Invade Every Friday, New Planet, World Plays Tag...
One first-person narrator tells everything; characters act silently. Standalone, ends warm.

Length 120-155 s, 60-110 scenes, one line per scene, up to 24 words (a cut every 2-3 s, longer sentences than other genres).

Arc (tag each scene with `"beat"`; lint checks the order)
1. `rule` (scene 0, 0-8 s): "In this world, <rule>." in 1-2 sentences, shown big. `title`: IN THIS WORLD... + the rule in CAPS.
2. `example` x2-4 (8-30 s): "You see, ..." mini-stories with different side characters; one is funny, one is a tiny tragedy that proves the rule has teeth.
3. `hero` (30-45 s): "My name is <Name>, and ..." + the family saying he repeats ("Don't count the days, bud. Make the days count.").
   Name the people he loves (mom, brother, best friend). The saying is paid off at the end.
4. Middle (45-100 s): the hero's world changes. Strange behaviours around him (everyone is suddenly nice, a parent hides something).
   Plant 2-3 `clue` scenes that the viewer notices but the hero doesn't (a hat, an unused eraser, a bully returning stolen money). Show clues, never explain them.
   Escalate every 3-4 scenes; give the hero a decision (make a list, follow the aliens, take the exam).
5. `twist` (~75-85% of the story): one reveal that re-reads EVERY clue ("That's when I realized..."). `punch` + sfx on the key word, slow push, music drops.
6. `choice`: the hero picks love over reward (circles NO, steps out the gate, holds her hand). One silent beat (`dur`) before it.
7. Aftermath: 3-6 quiet scenes (two days together, pancakes on the roof). Callback to the saying with a changed meaning.
8. `cta` (last scene): "Subscribe if you love your <mom/brother/friend>." Say it softly, after the closing line.

Rules
- Emotion first: the viewer should feel for a family member or true friend, not just laugh. Absurd world, sincere heart.
- Every clue is visible BEFORE the twist. Twist explains the hero's blind spot (they never saw their own timer / were watching the wrong person).
- Concrete specifics beat adjectives: "50,000 timers glow like fireflies", "10,000 desks under a glass roof", "pancakes for dinner on the roof".
- Escalate scale visually: one set-piece per act (stadium crowd, exam hall, floating city, Ferris wheel at night). Use `extras`, weather and `time` for mood.
- Camera: reaction close-ups on every emotional line, `low`/`establishing` for scale, slow `push` into the twist.
- Music: `curious`, `sad` after the twist, never `none`; `musicVol` stays low, the narrator leads.
- Kid-friendly: loss is implied or gentle (a quiet morning, an empty seat), never graphic.
- `publish.title`: "In This World, <rule> <emoji>" (<=70 chars). Description ends with a question about the viewer's own family.
