I need a goals tracker PWA app.

1) Tech Stack: Vite + React + TypeScript 5 + IndexedDB
2) On actual look and implementation, I have no constrains, I just have a suggetion from another ai on what I need:
Your problem is not that you lack effort. It is that your current setup is very good at capturing life and weak at turning captures into action.

Right now you have:

a stream of thoughts in messenger
a stream of work notes in docs
a stream of events in calendar

That gives you a lot of history, but history alone does not create progress. What is missing is a layer that answers:

What matters now?
What should happen this week?
What am I neglecting?
What is the next concrete action?

So yes, there is a system that can help, and if you build an app, it should be a control layer, not another giant note dump.

The main idea:

Keep your current tools for capture, but make a new app with the following logic components:
a) Capture: Notes taking tab, should allow to put a note that will be triaged later
b) Triage: Notes are converted either to flow: Goal (with measureble outcomes) -> projects (with deadlines, importance, effort and so on) or into individual tasks (maybe under a specific goal/project or generic goal like Other). Or into Goal -> routine (like reading daily, going to gym and so on)
c) Prioritization: Should be able to prioritize tasks, maybe by dragging or bumping priority or by deadline.
d) Do: what was actually done, checkmarks and so on
e) Review: weekly with a check list of whether inbox was cleaned, tasks prioritized, planned and so on.

The user should be able to modify everything or discard (and recover if needed) or delete permanently (with confirm). The user should be able to review goals especially with current progress (based on measurables). Also view projects/tasks/routines and modify their desriptions. Every project/task/routine may or may not be associated with a goal. If it's associated, it should be somehow visible in specific goal view.

For the actual tabs there needs to be:
a) Notes basically a page where the user can add a new note, see old ones and triage them by clicking on them (like making them into projects, tasks, notes, setting deadline, categorizing to goals and so on)
b) Tasks, just for prioritizing, viewing, editing (each tasks has deadline, prioirty and so on)
c) Today - some stats of today, quick interface for completing routines or tasks (from top 3 of the list). Each routing can be clicked only once a day, after it's clicked the button shows as complete but if the user clicks again, it should ask "cancel"? (to avoid accidents)
d) Porjects - where user can see all the projects and modify them (also projects should have a state - active or inactive to show that the projects at the top that the user is working on)
e) Goals - just a list of goals where clicking on each one shows measurable metrics, descriptions or linked projects/tasks/routines

3) The app has to have dark theme.
4) Also, I want it to be a bit gamified. I like computer games and interesting interface that are engaging and even a bit addictive. Gaming portion should not be the pramiry thing but the app should be convenient and engaging like a game. Don't use xp or coins or health in this app
5) I like interfaces that efficiently use space, since it's going to be an app for a phone. No bulky screens/items.
6) There also should be a debug menu where I can simulate day progression (like increase day by 1 artificially and so on)
7) Everything in the app should be visible and logged, like even discarded items or postponed.