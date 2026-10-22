# Skills Library

**Keep the agent skills you have judged, in one place.**

Every change is saved the moment you make it. There is no Save button.

## Adding a skill from GitHub

Paste the GitHub URL of a skill in **Paste a GitHub URL**, at the top of the **Library**, or type it and press Enter. It can be the URL of its `SKILL.md`, of its folder, or of the repo when the skill is at its root. The Module reads the `SKILL.md` from `raw.githubusercontent.com`, the only server it contacts, and adds the skill with the name and the description its frontmatter gives.

- **Already in your Library.** A skill from the same folder is there already: nothing is added, and its row is highlighted.
- **This is not the GitHub URL of a skill.** The URL is not one of the forms above.
- **No SKILL.md was found at this URL.** GitHub has no `SKILL.md` there.
- **The SKILL.md could not be read.** The connection failed, or GitHub did not answer.

After any of the last three, **Add manually** opens the form with the URL filled in, so you can finish by hand.

## Adding a skill by hand

Click **Add manually**, type the name of the skill, and optionally its URL and a description, then click **Add**. The skill appears at the top of the **Library**, to watch, with three stars, in the first quadrant. Its name is a link to its URL, when it has one. A URL that is already in your Library adds nothing.

## Judging a skill

Click a skill in the **Library** (or its pencil button, which works with the keyboard) to open its panel. On a narrow screen it fills the page. It holds:

- **Name**, **URL** and **Description**.
- **Quadrant**, chosen among the four.
- **Ring**: Recommended, Try, Watch or Deprecated.
- **Score**: one to five stars. Click a star, or use the arrow keys once a star is focused.
- **Notes**: free text in Markdown, up to 8,000 characters. A new skill starts with a template.

Each change is saved as you make it. Close the panel with **Close** or Escape. A change that cannot be saved says why under its field, and what you typed stays in place so you can fix it:

- **A name is required.** The name cannot be blank.
- **Notes are limited to 8,000 characters.** Trim the notes.
- **Another skill already has this URL.** Two skills cannot come from the same place.

## Archiving and deleting a skill

At the bottom of a skill's panel, **Archive** takes the skill off the **Library** without losing what you wrote about it. Archived skills are hidden unless you turn on **Show archived** above the list, where they appear greyed and tagged **Archived**; the page remembers the switch. **Unarchive** puts a skill back. An archived skill still counts for duplicates: adding its URL again shows it, with the switch turned on.

**Delete** removes a skill for good, after you confirm. It only appears for a skill that is in no edition: a skill you published offers **Archive** only.

## Renaming the quadrants

In the **Library**, click **Rename quadrants** and edit the four names (1 to 40 characters, required). A name is saved as soon as it is valid; a blank one shows **A quadrant name is required.** and is not saved. Renaming a quadrant moves no skill: each stays in its quadrant, under the new name.

## Filtering and searching

Above the list, **Search by name** ignores case and accents. The buttons for each ring and each quadrant filter the list; select several to see skills that match any of them. **Clear filters** appears when a filter is on, and **No skill matches these filters.** when nothing is left. The page remembers your filters.

## The radar

The **Radar** tab draws the radar of your next edition: every skill that is not archived, as a numbered dot. Its quadrant gives the dot its colour and its corner, and its ring, from the centre outwards (Recommended, Try, Watch, Deprecated), gives its distance from the centre. A dot stays where it is until you change the ring or the quadrant of its skill.

The marker tells what changed since the last edition: a circle for a skill unchanged or only updated, a diamond for a new skill or one that is back, a triangle up for a skill moved towards the centre and a triangle down for one moved away from it. The legend under the radar (beside it on a wide screen) lists the skills with the same numbers, by quadrant, then by ring, then by name.

Click a dot, or a line of the legend, to open the skill in the **Library**.

Under the legend, **N changes waiting** lists what the next edition would announce: new skills, skills back, skills moved (**Moved: Try → Recommended**) and skills retired (**Retired (was Watch)**). Click one to open it; a retired skill is archived, so the **Library** turns on **Show archived** to show it. Until you have published an edition, every skill is new.

## Publishing an edition

An edition freezes your radar under a number and a date, with an introduction. In the **Radar** tab, click **Publish edition 1** (the number is always the next one). Write the **Introduction** in Markdown (it is required), click **Next**, then **Publish**. A published edition cannot be changed afterwards. If it cannot be saved, the dialog says why and nothing is published.

Once an edition is published, the changes waiting are counted from it. When the ring of a skill differs from the one in the last edition, its panel asks **Why did it move?** (up to 280 characters). Moving the skill back to its published ring removes the question and what you wrote.

While a moved skill has no explanation, the dialog lists those skills instead of publishing: click one to open its panel and write it. Publishing erases the explanations, which the edition keeps.

## The widget

The Home shows how many skills each ring holds (archived skills are left out), the date of the last edition (or "No edition yet") and, when there are any, how many changes are waiting to be published. **Open** brings you to the page. The widget reads your skills again each time the Home comes back.

## The tabs

- **Library** lists your skills, the newest first, with their ring, their stars and their quadrant.
- **Radar** draws your skills as a radar, with the changes waiting to be published.
- **Editions** lists the editions you published, the newest first: its number, its date and how many skills it holds in each ring. An edition is never changed.

The page remembers the tab you left it on.
