
const MAX_DAYS_IN_PREGNANCY = 42 * 7;  // 42 weeks

function getRangeForTask(task) {
  const a = task.triggers.map(t => {
    t = task.triggerUnit === 'weeks' ? t * 7 : t;
    const start = t - task.pre;
    const end = t + task.post;
    return range(start, end);
  });

  // return the flattened 1D array, with distinct members
  return [...new Set([].concat.apply([], a))];
}

//1 day before start, start day, end day, 1 day after end day 
function getTaskWindowEdges(task) {
  const arrays = task.triggers.map(trigger => {
    trigger = task.triggerUnit === 'weeks' ? trigger * 7 : trigger;
    const start = trigger - task.pre;
    const end = trigger + task.post;
    return [start - 1, start, end, end + 1];
  });

  // return the flattened 1D array, with distinct members
  return [...new Set([].concat.apply([], arrays))];
}

function range(start, end, difference = 1) {
  return Array.apply(null, { length: (end - start) / difference + 1 }).map((_, i) => i * difference + start);
}

//combine range from start to end separated by d days, task window edges, get unique and sort
function getTaskTestDays(start, end, task, interval = 1) {
  return [...new Set(range(start, end, interval).concat(getTaskWindowEdges(task)))].sort(function(a, b) {return a - b;});
}

// The platform adds routine tasks the reference tests don't know about: newborn home visits after a
// delivery (Module 1), and a barrier screen and birth plan for every pregnancy (Module 6). Reference
// tests that assert "no tasks left" are about their own tasks, so they leave these out. Muting of
// the platform's tasks is checked directly: the unfiltered "cleared" assertion in
// pregnancy_danger_signs.spec.js, and the clearing tests in barriers.spec.js and
// newborn_home_visit.spec.js.
const PLATFORM_ROUTINE_TITLES = [
  'task.pnc.newborn_home_visit.title',
  'task.barrier.screen.title',
  'task.birth_plan.make.title',
];
const excludingPlatformRoutineTasks = tasks => tasks.filter(task => !PLATFORM_ROUTINE_TITLES.includes(task.emission.title));

module.exports = {
  MAX_DAYS_IN_PREGNANCY,
  range,
  getRangeForTask,
  getTaskTestDays,
  excludingPlatformRoutineTasks,
};
