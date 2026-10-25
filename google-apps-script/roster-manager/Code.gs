const GOOGLE_WORKFLOW_BUILD = 'google-workflow-control-plane-v2';
const GOOGLE_WORKFLOW_STATE_KEY = 'google_workflow_state_v2';

function readWorkflowState_() {
  const raw = PropertiesService.getDocumentProperties().getProperty(GOOGLE_WORKFLOW_STATE_KEY);
  if (!raw) return { version: 2, build: GOOGLE_WORKFLOW_BUILD, setupComplete: false };
  try { return Object.assign({ version: 2, build: GOOGLE_WORKFLOW_BUILD }, JSON.parse(raw)); }
  catch (error) { return { version: 2, build: GOOGLE_WORKFLOW_BUILD, setupComplete: false, stateError: String(error) }; }
}
function writeWorkflowState_(patch) {
  const next = Object.assign({}, readWorkflowState_(), patch || {}, { version: 2, build: GOOGLE_WORKFLOW_BUILD, updatedAt: new Date().toISOString() });
  PropertiesService.getDocumentProperties().setProperty(GOOGLE_WORKFLOW_STATE_KEY, JSON.stringify(next));
  return next;
}
function pingWorkflowServer() {
  return { ok: true, build: GOOGLE_WORKFLOW_BUILD, spreadsheetId: SpreadsheetApp.getActive().getId(), timestamp: new Date().toISOString() };
}
function getWorkflowState() {
  const state = readWorkflowState_();
  const settings = getWorkbookSettingsMap_();
  const setting = key => settings.get(normalize_(key)) || '';
  return Object.assign({}, state, {
    build: GOOGLE_WORKFLOW_BUILD,
    setupComplete: state.setupComplete === true || normalize_(setting('first_time_setup_completed')) === 'true',
    setupError: setting('first_time_setup_error') || state.setupError || '',
    schedulerUrl: setting('scheduler_workflow_url') || setting('scheduler_url') || state.schedulerUrl || '',
    formId: setting('google_student_form_id') || state.formId || '',
    formConnected: normalize_(setting('student_form_connected')) === 'true' || state.formConnected === true,
    clubDocUrl: setting('printable_club_rosters_doc_url') || state.clubDocUrl || '',
    homeroomDocUrl: setting('printable_homeroom_rosters_doc_url') || state.homeroomDocUrl || '',
    responseCount: Number(setting('coded_choices_response_count') || state.responseCount || 0),
    codedChoiceCount: Number(setting('coded_choices_matched_count') || state.codedChoiceCount || 0),
    draftCount: Math.max(0, (SpreadsheetApp.getActive().getSheetByName(RM.sheets.draftNamed) || { getLastRow: function(){ return 1; } }).getLastRow() - 1),
    editorReady: Boolean(SpreadsheetApp.getActive().getSheetByName('Edit Draft Rosters')),
    validatedAt: setting('edited_rosters_validated_at') || state.validatedAt || '',
    printableAt: setting('printable_rosters_last_generated') || state.printableAt || ''
  });
}
function rebuildWorkflowState() {
  const priorState = readWorkflowState_();
  const ss = SpreadsheetApp.getActive();
  const rows = name => { const sheet = ss.getSheetByName(name); return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0; };
  const settings = getWorkbookSettingsMap_();
  const setting = key => settings.get(normalize_(key)) || '';
  return writeWorkflowState_({
    setupComplete: normalize_(setting('first_time_setup_completed')) === 'true',
    formId: setting('google_student_form_id'),
    formConnected: normalize_(setting('student_form_connected')) === 'true',
    responseCount: rows(setting('form_response_sheet_name') || 'Form Responses'),
    responseIssueCount: rows('Response Problems'),
    codedChoiceCount: Number(setting('coded_choices_matched_count') || rows(RM.sheets.codedChoices) || 0),
    draftCount: rows(RM.sheets.draftNamed),
    editorReady: Boolean(ss.getSheetByName('Edit Draft Rosters')),
    validatedAt: setting('edited_rosters_validated_at'),
    validationProblemCount: rows('Roster Problems'),
    finalCount: rows('Final Rosters'),
    printableAt: setting('printable_rosters_last_generated'),
    schedulerUrl: setting('scheduler_workflow_url') || setting('scheduler_url') || priorState.schedulerUrl || '',
    clubDocUrl: setting('printable_club_rosters_doc_url'),
    homeroomDocUrl: setting('printable_homeroom_rosters_doc_url')
  });
}

const RM = Object.freeze({
  sheets: {
    studentMap: 'Student Map',
    codedChoices: 'Coded Choices Export',
    draftNamed: 'Draft Named Rosters',
    finalNamed: 'Final Named Rosters',
    finalCoded: 'Final Coded Assignments',
    start: 'Start Here',
    studentsReview: 'Students Needing Review',
    clubRosters: 'Club Rosters',
    finalChecks: 'Final Checks',
    clubSizeCheck: 'Club Size Check',
    changeHistory: 'Change History',
    workflow: '_Roster Manager Status',
    clubReference: 'Club Reference',
    interestReference: 'Student Interest Reference'
  },
  finalNamedHeaders: ['club_title','section_label','student_name','grade','homeroom_name','student_code','notes'],
  finalCodedHeaders: ['student_code','club_title','section_label','assignment_order'],
  historyHeaders: ['changed_at','changed_by','action','student_name','student_code','from_club','to_club','note'],
  reviewHeaders: ['student_name','grade','homeroom_name','requested','assigned','high_interest_received','reason','review_status','student_code'],
  checkHeaders: ['severity','student','club','roster_row','problem','suggested_fix','status','go_to_row'],
  clubSizeHeaders: ['club_title','section_label','capacity','minimum_students','current_count','over_capacity_by','below_minimum_by','status','notes'],
  rosterHeaders: ['club_title','section_label','student_name','grade','homeroom_name','notes','student_code'],
  statusHeaders: ['key','value'],
  colors: {navy:'#16324F',green:'#E2F0D9',yellow:'#FFF2CC',red:'#FCE8E6'},
  aliases: {
    studentCode:['student code','student_code','studentcode','code'],
    studentName:['student name','student_name','studentname','name'],
    grade:['grade'],
    homeroom:['homeroom name','homeroom_name','homeroom','teacher homeroom text'],
    maxClubs:['max clubs','max_clubs','maxclubs'],
    clubTitle:['club title','club_title','club'],
    sectionLabel:['section label','section_label','section'],
    notes:['notes','note']
  }
});

function onOpen() {
  const setupComplete = readWorkflowState_().setupComplete === true;
  const setupLabel = setupComplete ? 'Repair workbook setup' : 'First-time setup';
  SpreadsheetApp.getUi().createMenu('Club Scheduler')
    .addItem('Open Google Workflow', 'showRosterManager')
    .addItem(setupLabel, 'runFirstTimeSetupFromWorkflow')
    .addSeparator()
    .addItem('Connect student form', 'connectStudentFormResponses')
    .addItem('Enter paper responses', 'openTeacherEnteredChoices')
    .addItem('Prepare student choices', 'refreshChoicesIncludingSeededTests')
    .addSeparator()
    .addItem('Prepare roster editor', 'buildEditDraftRosters')
    .addItem('Open roster editor', 'openEditDraftRosters')
    .addItem('Validate roster changes', 'validateEditedRosters')
    .addItem('Review roster problems', 'openRosterProblems')
    .addItem('Open final rosters', 'openFinalRosters')
    .addItem('Create printable rosters', 'createPrintableRosterDocs')
    .addSeparator()
    .addItem('Return to Scheduler', 'openSchedulerWorkflow')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Advanced tools')
      .addItem('Rebuild workflow status', 'rebuildWorkflowState')
      .addItem('Check data pipeline', 'showPipelineDiagnostics')
      .addItem('Show system sheets', 'showSystemSheets')
      .addItem('Hide system sheets', 'hideSystemSheets')
      .addItem('Refresh workbook layout', 'applyCoordinatorWorkbookLayout_'))
    .addToUi();
}

function showRosterManager() {
  const html = HtmlService.createTemplateFromFile('Sidebar').evaluate().setTitle('Google Workflow');
  SpreadsheetApp.getUi().showSidebar(html);
}
function openSchedulerWorkflow() {
  const state = readWorkflowState_();
  const url = getWorkbookSetting_('scheduler_workflow_url') || getWorkbookSetting_('scheduler_url') || state.schedulerUrl || '';
  if (!url) throw new Error('The Scheduler workflow link is not saved in this workbook.');
  const html = HtmlService.createHtmlOutput('<script>window.open(' + JSON.stringify(url) + ',"_blank");google.script.host.close();<\/script>');
  SpreadsheetApp.getUi().showModalDialog(html, 'Opening Scheduler');
}
function showPipelineDiagnostics() {
  const data = getGooglePipelineDiagnostics();
  SpreadsheetApp.getUi().alert('Data pipeline', JSON.stringify(data, null, 2), SpreadsheetApp.getUi().ButtonSet.OK);
}

function firstTimeSetup() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  setWorkbookSetting_('first_time_setup_running', 'TRUE');
  setWorkbookSetting_('first_time_setup_error', '');
  writeWorkflowState_({ setupRunning: true, setupError: '' });
  try {
    SpreadsheetApp.getActive().getName();
    DriveApp.getFileById(ss.getId()).getName();
    ScriptApp.getProjectTriggers();
    setupRosterManagerCore_();
    const formId = getWorkbookSetting_('google_student_form_id');
    if (formId) { try { FormApp.openById(formId).getTitle(); ensureFormSubmitTrigger_(); } catch (error) { console.warn(error); } }
    setWorkbookSetting_('first_time_setup_completed', 'TRUE');
    setWorkbookSetting_('first_time_setup_completed_at', new Date().toISOString());
    setWorkbookSetting_('first_time_setup_running', 'FALSE');
    setWorkbookSetting_('first_time_setup_error', '');
    writeWorkflowState_({ setupComplete: true, setupRunning: false, setupError: '', formId });
    applyCoordinatorWorkbookLayout_();
    SpreadsheetApp.flush();
    ss.toast('Workbook setup is complete.', 'Club Scheduler', 6);
    return rebuildWorkflowState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setWorkbookSetting_('first_time_setup_running', 'FALSE');
    setWorkbookSetting_('first_time_setup_completed', 'FALSE');
    setWorkbookSetting_('first_time_setup_error', message);
    writeWorkflowState_({ setupComplete: false, setupRunning: false, setupError: message });
    ui.alert('Setup is not finished', 'Run Club Scheduler > First-time setup again.\n\nDetails: ' + message, ui.ButtonSet.OK);
    throw error;
  }
}


function setupRosterManager() {
  return firstTimeSetup();
}

function setupRosterManagerCore_() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, RM.sheets.start, [['Club Scheduler']]);
  ensureSheet_(ss, RM.sheets.changeHistory, [RM.historyHeaders]);
  ensureSheet_(ss, RM.sheets.workflow, [RM.statusHeaders]);
  ensureSheet_(ss, RM.sheets.finalCoded, [RM.finalCodedHeaders]);
  ensureSheet_(ss, 'Response Problems', [['response_row','student_name','email','problem','suggested_fix']]);
  ensureSheet_(ss, 'Roster Problems', [['severity','student','club','editor_row','problem','suggested_fix']]);
  removeObsoleteRosterPlaceholder_();
}


function isFirstTimeSetupComplete_() {
  return normalize_(getWorkbookSetting_('first_time_setup_completed')) === 'true';
}

function removeObsoleteRosterPlaceholder_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Homeroom Rosters');
  if (!sheet) return;
  const value = normalize_(sheet.getRange(1, 1).getDisplayValue());
  if (sheet.getLastRow() <= 1 && (!value || value.includes('printable homeroom rosters'))) {
    ss.deleteSheet(sheet);
  }
}

function systemSheetNames_() {
  return [
    'Settings','Homerooms',RM.sheets.studentMap,RM.sheets.codedChoices,
    'Draft Coded Assignments',RM.sheets.draftNamed,RM.sheets.finalNamed,
    RM.sheets.finalCoded,RM.sheets.clubReference,RM.sheets.interestReference,
    RM.sheets.workflow,'Instructions',RM.sheets.clubSizeCheck,
    'Students with No Club','Students Needing More Clubs',
    RM.sheets.studentsReview,RM.sheets.clubRosters,RM.sheets.finalChecks
  ];
}

function visibleWorkflowSheetNames_() {
  return [
    'Form Responses',
    'Response Problems',
    'Edit Draft Rosters',
    'Roster Problems',
    'Final Rosters',
    RM.sheets.changeHistory
  ];
}

function showSystemSheets() {
  const ss = SpreadsheetApp.getActive();
  systemSheetNames_().forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) sheet.showSheet();
  });
  ss.toast('System sheets are visible. Use Advanced tools > Hide system sheets when you are finished.', 'Advanced tools', 8);
}

function hideSystemSheets() {
  applyCoordinatorWorkbookLayout_();
  SpreadsheetApp.getActive().toast('System sheets are hidden.', 'Workbook layout', 5);
}

function applyCoordinatorWorkbookLayout_() {
  const ss = SpreadsheetApp.getActive();
  removeObsoleteRosterPlaceholder_();

  const responseProblems = ss.getSheetByName('Response Problems');
  const responseProblemsHaveRows = responseProblems && responseProblems.getLastRow() > 1;

  visibleWorkflowSheetNames_().forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    if (name === 'Response Problems' && !responseProblemsHaveRows) {
      if (!sheet.isSheetHidden()) sheet.hideSheet();
      return;
    }
    sheet.showSheet();
  });

  systemSheetNames_().forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getName() === ss.getActiveSheet().getName()) return;
    if (!sheet.isSheetHidden()) sheet.hideSheet();
  });

  const ordering = visibleWorkflowSheetNames_();
  ordering.forEach((name, index) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.isSheetHidden()) return;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(index + 1);
  });

  const colors = {
    [RM.sheets.start]: '#16324F',
    'Form Responses': '#5B8FF9',
    'Response Problems': '#D97706',
    [RM.sheets.finalNamed]: '#2563EB',
    [RM.sheets.studentsReview]: '#D97706',
    [RM.sheets.clubRosters]: '#64748B',
    [RM.sheets.finalChecks]: '#DC2626',
    [RM.sheets.changeHistory]: '#64748B'
  };

  Object.keys(colors).forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) sheet.setTabColor(colors[name]);
  });

  protectTechnicalSheets_();
  const preferred = ss.getSheetByName('Edit Draft Rosters') || ss.getSheetByName('Form Responses') || ss.getSheets().find(function(sheet){ return !sheet.isSheetHidden(); });
  if (preferred) preferred.activate();
}


function refreshRosterManager() {
  const model = buildModel_();
  const validation = validateWorkingRoster_(model);

  writeStudentsReview_(model);
  writeClubRosters_(model);
  writeFinalChecks_(model, validation);
  writeClubSizeCheck_(model, validation);
  applyCoordinatorWorkbookLayout_();
  applyRosterIssueMarkup_(model, validation);
  applyRosterManagerFilters_(model);
  applyFinalNamedValidation_(model);
  protectTechnicalSheets_();

  if (validation.blocking.length > 0) {
    SpreadsheetApp.flush();
    SpreadsheetApp.getActive().toast(
      `Found ${validation.blocking.length} roster problem${validation.blocking.length === 1 ? '' : 's'} that must be fixed. Review the highlighted rows or open Final Checks. Final coded assignments were not updated.`,
      'Roster review',
      8
    );
    return getDashboardData();
  }

  writeFinalCoded_(model);
  setStatus_('last_refresh', new Date().toISOString());
  SpreadsheetApp.flush();

  if (validation.advisory.length > 0) {
    SpreadsheetApp.getActive().toast(
      `Review pages updated. There are ${validation.advisory.length} item${validation.advisory.length === 1 ? '' : 's'} to review, but no blocking problems.`,
      'Roster review',
      6
    );
  } else {
    SpreadsheetApp.getActive().toast(
      'Roster review pages updated. No blocking problems found.',
      'Roster review',
      5
    );
  }

  return getDashboardData();
}

function refreshFinalChecks() { return refreshRosterManager(); }


function operationStart_(name, phase) {
  setStatus_('operation_name', name);
  setStatus_('operation_state', 'running');
  setStatus_('operation_phase', phase || 'Starting');
  setStatus_('operation_started_at', new Date().toISOString());
  setStatus_('operation_finished_at', '');
  setStatus_('operation_message', '');
}
function operationFinish_(message, state) {
  setStatus_('operation_state', state || 'completed');
  setStatus_('operation_phase', 'Finished');
  setStatus_('operation_finished_at', new Date().toISOString());
  setStatus_('operation_message', message || 'Completed');
}
function getGooglePipelineDiagnostics() {
  const ss = SpreadsheetApp.getActive();
  const studentMapSheet = ss.getSheetByName(RM.sheets.studentMap);
  const responseSheet = findFormResponseSheet_();
  const codedSheet = ss.getSheetByName(RM.sheets.codedChoices);
  const draftCodedSheet = ss.getSheetByName('Draft Coded Assignments');
  const draftNamedSheet = ss.getSheetByName(RM.sheets.draftNamed);
  const finalNamedSheet = ss.getSheetByName(RM.sheets.finalNamed);
  const finalCodedSheet = ss.getSheetByName(RM.sheets.finalCoded);
  const model = buildModel_();
  const validation = validateWorkingRoster_(model);

  const countRows = sheet => sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  const uniqueCodes = sheet => {
    if (!sheet || sheet.getLastRow() < 2) return 0;
    const values = sheet.getDataRange().getDisplayValues();
    const headers = headerMap_(values[0] || []);
    const codeIndex = findHeader_(headers, RM.aliases.studentCode);
    if (codeIndex < 0) return 0;
    return new Set(values.slice(1).map(row => String(row[codeIndex] || '').trim()).filter(Boolean)).size;
  };

  const diagnostics = {
    studentMapStudents: uniqueCodes(studentMapSheet),
    formResponseRows: countRows(responseSheet),
    codedChoiceStudents: uniqueCodes(codedSheet),
    draftCodedRows: countRows(draftCodedSheet),
    draftNamedStudents: uniqueCodes(draftNamedSheet),
    finalNamedStudents: uniqueCodes(finalNamedSheet),
    finalNamedAssignments: countRows(finalNamedSheet),
    finalCodedAssignments: countRows(finalCodedSheet),
    modelAssignments: model.assignments.length,
    studentsNeedingReview: model.reviewRows.filter(row => row.reviewStatus !== 'Reviewed').length,
    blockingProblems: validation.blocking.length,
    advisoryProblems: validation.advisory.length,
    formResponseSheet: responseSheet ? responseSheet.getName() : '',
    lastChoicesRefresh: getWorkbookSetting_('coded_choices_last_refresh') || '',
    lastRosterRefresh: getStatus_('last_refresh') || ''
  };

  setStatus_('last_pipeline_diagnostics', JSON.stringify(diagnostics));
  return diagnostics;
}


function buildEditDraftRosters() {
  operationStart_('Prepare roster editor', 'Creating the spreadsheet roster editor');
  try {
    const result = buildEditDraftRosters_();
    operationFinish_('Edit Draft Rosters is ready', 'completed');
    SpreadsheetApp.getActive().toast('Edit Draft Rosters is ready. Move whole student cards only.', 'Google Workflow', 8);
    return result;
  } catch (error) {
    operationFinish_(error instanceof Error ? error.message : String(error), 'failed');
    throw error;
  }
}

function openEditDraftRosters() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Edit Draft Rosters');
  if (sheet) SpreadsheetApp.getActive().setActiveSheet(sheet);
  else buildEditDraftRosters();
}

function buildEditDraftRosters_() {
  const ss = SpreadsheetApp.getActive();
  const draftSheet = ss.getSheetByName(RM.sheets.draftNamed) || ss.getSheetByName('Draft Named Rosters');
  if (!draftSheet || draftSheet.getLastRow() < 2) throw new Error('Draft named rosters are not available yet. Send draft rosters from Scheduler first.');

  const studentMap = readStudentCardsForEditor_();
  const clubs = readClubBlocksForEditor_();
  const assignments = readDraftRosterAssignmentsForEditor_(draftSheet, studentMap);
  const interests = readChoiceInterestForEditor_();
  const editSheet = ensureSheet_(ss, 'Edit Draft Rosters', [['Edit Draft Rosters']]);
  editSheet.getDataRange().breakApart();
  editSheet.clear();
  editSheet.clearFormats();
  editSheet.showSheet();

  const blockWidth = 2;
  const spacerWidth = 1;
  const neededCols = Math.max(2, clubs.length * (blockWidth + spacerWidth) - spacerWidth);
  const rows = [
    ['Edit Draft Rosters'],
    ['Move a student by cutting and pasting only the student-card cell. Do not move the slot number and do not type names by hand.'],
    ['When finished, return to Google Workflow to validate and prepare the final coded roster.'],
    ['']
  ];
  const blockRanges = [];
  let tallest = 0;

  clubs.forEach((club, index) => {
    const col = 1 + index * (blockWidth + spacerWidth);
    const block = buildClubEditorBlock_(club, assignments, interests, studentMap);
    writeBlockToEditorRows_(rows, 5, col, block.rows, blockWidth);
    blockRanges.push({row:5,col,height:block.rows.length,width:blockWidth,rosterRows:block.rosterRows,overflowRows:block.overflowRows,waitlistOffset:block.waitlistOffset,otherOffset:block.otherOffset});
    tallest = Math.max(tallest, block.rows.length);
  });

  const neededRows = Math.max(10, 4 + tallest + 2);
  while (rows.length < neededRows) rows.push([]);
  const normalizedRows = rows.map(row => {
    const output = row.slice(0, neededCols);
    while (output.length < neededCols) output.push('');
    return output;
  });

  if (editSheet.getMaxRows() < neededRows) editSheet.insertRowsAfter(editSheet.getMaxRows(), neededRows - editSheet.getMaxRows());
  if (editSheet.getMaxColumns() < neededCols) editSheet.insertColumnsAfter(editSheet.getMaxColumns(), neededCols - editSheet.getMaxColumns());
  editSheet.getRange(1,1,neededRows,neededCols).setValues(normalizedRows);
  formatEditDraftRostersSheet_(editSheet, blockRanges, neededRows, neededCols);
  setWorkbookSetting_('edit_draft_rosters_last_built', new Date().toISOString());
  setWorkbookSetting_('edit_draft_rosters_club_count', String(clubs.length));
  editSheet.activate();
  return {ok:true,clubs:clubs.length,sheet:'Edit Draft Rosters'};
}

function buildClubEditorBlock_(club, assignments, interests, studentMap) {
  const key = normalizeClubEditorKey_(club.display);
  const assigned = (assignments.get(key) || []).slice().sort((a,b) => String(a.display).localeCompare(String(b.display)));
  const capacity = club.capacity || 0;
  const rosterRows = capacity > 0 ? Math.max(capacity, assigned.length) : Math.max(assigned.length + 5, 10);
  const overflowRows = capacity > 0 ? 5 : 0;
  const stillNeeds = [];
  const otherInterested = [];

  (interests.get(key) || []).forEach(item => {
    if (assigned.some(row => row.code === item.code)) return;
    const student = studentMap.get(item.code);
    if (!student) return;
    if (club.gradeLimited && club.eligibleGrades.length && !club.eligibleGrades.includes(String(student.grade))) return;
    const assignmentCount = countStudentAssignmentsForEditor_(item.code, assignments);
    const maxClubs = Number(item.maxClubs || 0) || 1;
    const status = assignmentCount + ' of ' + maxClubs + ' clubs';
    const display = student.baseCard + ' | ' + status + ' | ' + item.code;
    const row = {code:item.code,display,interest:item.interest,assignmentCount,maxClubs};
    if (assignmentCount < maxClubs) stillNeeds.push(row); else otherInterested.push(row);
  });

  const needSort = (a,b) => a.assignmentCount-b.assignmentCount || b.maxClubs-a.maxClubs || editorInterestRank_(b.interest)-editorInterestRank_(a.interest) || a.display.localeCompare(b.display);
  stillNeeds.sort(needSort);
  otherInterested.sort(needSort);

  const rows = [];
  rows.push([club.display,'']);
  rows.push([[club.meta, capacity ? 'Capacity '+capacity : 'Unlimited', club.minimum ? 'Minimum '+club.minimum : ''].filter(Boolean).join(' | '),'']);
  rows.push(['Roster','']);
  rows.push(['Slot','Cut and paste this cell']);
  for (let i=0;i<rosterRows;i+=1) rows.push([String(i+1),assigned[i]?assigned[i].display:'']);
  for (let i=0;i<overflowRows;i+=1) rows.push([String(rosterRows+i+1),'']);
  rows.push(['','']);
  const waitlistOffset = rows.length;
  rows.push(['Waitlist: still needs club','']);
  if (stillNeeds.length) stillNeeds.forEach(row => rows.push(['',row.display])); else rows.push(['','None']);
  rows.push(['','']);
  const otherOffset = rows.length;
  rows.push(['Other interested students','']);
  if (otherInterested.length) otherInterested.forEach(row => rows.push(['',row.display])); else rows.push(['','None']);
  return {rows,rosterRows,overflowRows,waitlistOffset,otherOffset};
}

function writeBlockToEditorRows_(rows, startRow, startCol, blockData, blockWidth) {
  const zeroRow = startRow - 1;
  const zeroCol = startCol - 1;
  for (let r = 0; r < blockData.length; r += 1) {
    const targetRow = zeroRow + r;
    while (rows.length <= targetRow) rows.push([]);
    while (rows[targetRow].length < zeroCol) rows[targetRow].push('');
    for (let c = 0; c < blockWidth; c += 1) {
      rows[targetRow][zeroCol + c] = blockData[r][c] || '';
    }
  }
}

function formatEditDraftRostersSheet_(sheet, blockRanges, rowCount, colCount) {
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(5);
  sheet.setFrozenColumns(0);
  sheet.getRange(1,1,1,colCount).merge().setFontSize(16).setFontWeight('bold').setBackground('#16324F').setFontColor('#FFFFFF');
  sheet.getRange(2,1,1,colCount).merge().setBackground('#FFF2CC').setFontWeight('bold').setWrap(true);
  sheet.getRange(3,1,1,colCount).merge().setBackground('#FFF2CC').setWrap(true);
  sheet.getRange(1,1,rowCount,colCount).setFontFamily('Arial').setVerticalAlignment('top').setWrap(true);

  for (let col=1;col<=colCount;col+=1) {
    const position = (col-1)%3;
    if (position===0) sheet.setColumnWidth(col,44);
    else if (position===1) sheet.setColumnWidth(col,285);
    else sheet.setColumnWidth(col,22);
  }

  blockRanges.forEach(block => {
    sheet.getRange(block.row,block.col,1,2).merge().setBackground('#D9EAF7').setFontWeight('bold').setFontSize(12);
    sheet.getRange(block.row+1,block.col,1,2).merge().setBackground('#EDF4FA').setFontColor('#475467');
    sheet.getRange(block.row+2,block.col,1,2).merge().setBackground('#E2F0D9').setFontWeight('bold');
    sheet.getRange(block.row+3,block.col,1,2).setBackground('#F3F6FA').setFontWeight('bold');
    sheet.getRange(block.row+4,block.col,block.rosterRows,2).setBackground('#F7FBF3');
    if (block.overflowRows>0) sheet.getRange(block.row+4+block.rosterRows,block.col,block.overflowRows,2).setBackground('#FCE4D6');
    sheet.getRange(block.row+block.waitlistOffset,block.col,1,2).merge().setBackground('#FFF2CC').setFontWeight('bold');
    sheet.getRange(block.row+block.otherOffset,block.col,1,2).merge().setBackground('#E7E6E6').setFontWeight('bold');
    sheet.getRange(block.row,block.col,block.height,2).setBorder(true,true,true,true,true,true,'#666666',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
}

function readStudentCardsForEditor_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(RM.sheets.studentMap) || ss.getSheetByName('Student Map');
  const map = new Map();
  if (!sheet || sheet.getLastRow() < 2) return map;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0]);
  const codeI = findHeader_(headers, RM.aliases.studentCode);
  const nameI = findHeader_(headers, RM.aliases.studentName);
  const gradeI = findHeader_(headers, RM.aliases.grade);
  const homeroomI = findHeader_(headers, RM.aliases.homeroom);
  values.slice(1).forEach(row => {
    const code = String(row[codeI] || '').trim();
    if (!code) return;
    const name = String(row[nameI] || code).trim();
    const grade = gradeI >= 0 ? String(row[gradeI] || '').trim() : '';
    const homeroom = homeroomI >= 0 ? String(row[homeroomI] || '').trim() : '';
    const baseCard = name + ' (G' + grade + ', ' + homeroom + ')';
    const card = baseCard + ' | ' + code;
    map.set(code,{code,name,grade,homeroom,baseCard,card});
  });
  return map;
}

function readClubBlocksForEditor_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Club Reference');
  const clubs = [];
  if (!sheet || sheet.getLastRow() < 2) return deriveClubsFromDraftNamedForEditor_();
  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0]);
  const titleI = findHeader_(headers, ['club_title', 'club title', 'club']);
  const sectionI = findHeader_(headers, ['section_label', 'section label', 'section']);
  const capacityI = findHeader_(headers, ['max_capacity', 'capacity', 'max capacity']);
  const minI = findHeader_(headers, ['minimum_viable_enrollment', 'minimum', 'min']);
  const leaderI = findHeader_(headers, ['sponsor_name', 'leader', 'sponsor']);
  const daysI = findHeader_(headers, ['meeting_days', 'meeting days', 'day']);
  values.slice(1).forEach(row => {
    const title = titleI >= 0 ? String(row[titleI] || '').trim() : '';
    if (!title) return;
    const section = sectionI >= 0 ? String(row[sectionI] || '').trim() : '';
    const display = section ? title + ' (' + section + ')' : title;
    const leader = leaderI >= 0 ? String(row[leaderI] || '').trim() : '';
    const days = daysI >= 0 ? String(row[daysI] || '').trim() : '';
    clubs.push({
      title,
      section,
      display,
      capacity: capacityI >= 0 ? Number(row[capacityI] || 0) || 0 : 0,
      minimum: minI >= 0 ? Number(row[minI] || 0) || 0 : 0,
      meta: [leader, days].filter(Boolean).join(' · ')
    });
  });
  return clubs.length ? clubs : deriveClubsFromDraftNamedForEditor_();
}

function deriveClubsFromDraftNamedForEditor_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(RM.sheets.draftNamed) || SpreadsheetApp.getActive().getSheetByName('Draft Named Rosters');
  const clubs = [];
  const seen = new Set();
  if (!sheet || sheet.getLastRow() < 2) return clubs;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0]);
  const clubI = findHeader_(headers, RM.aliases.clubTitle);
  const sectionI = findHeader_(headers, RM.aliases.sectionLabel);
  values.slice(1).forEach(row => {
    const title = clubI >= 0 ? String(row[clubI] || '').trim() : '';
    const section = sectionI >= 0 ? String(row[sectionI] || '').trim() : '';
    if (!title) return;
    const display = section ? title + ' (' + section + ')' : title;
    const key = normalizeClubEditorKey_(display);
    if (seen.has(key)) return;
    seen.add(key);
    clubs.push({ title, section, display, capacity: 0, minimum: 0, meta: '' });
  });
  return clubs;
}

function readDraftRosterAssignmentsForEditor_(sheet, studentMap) {
  const map = new Map();
  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0]);
  const codeI = findHeader_(headers, RM.aliases.studentCode);
  const nameI = findHeader_(headers, RM.aliases.studentName);
  const gradeI = findHeader_(headers, RM.aliases.grade);
  const homeroomI = findHeader_(headers, RM.aliases.homeroom);
  const clubI = findHeader_(headers, RM.aliases.clubTitle);
  const sectionI = findHeader_(headers, RM.aliases.sectionLabel);
  values.slice(1).forEach(row => {
    const code = codeI>=0 ? String(row[codeI]||'').trim() : '';
    const title = clubI>=0 ? String(row[clubI]||'').trim() : '';
    if (!code || !title) return;
    const section = sectionI>=0 ? String(row[sectionI]||'').trim() : '';
    const display = section ? title+' ('+section+')' : title;
    const key = normalizeClubEditorKey_(display);
    const existing = studentMap.get(code);
    const name = existing ? existing.name : (nameI>=0 ? String(row[nameI]||code).trim() : code);
    const grade = existing ? existing.grade : (gradeI>=0 ? String(row[gradeI]||'').trim() : '');
    const homeroom = existing ? existing.homeroom : (homeroomI>=0 ? String(row[homeroomI]||'').trim() : '');
    const card = existing ? existing.card : name+' (G'+grade+', '+homeroom+') | '+code;
    const list = map.get(key)||[];
    list.push({code,display:card});
    map.set(key,list);
  });
  return map;
}

function readChoiceInterestForEditor_() {
  const ss = SpreadsheetApp.getActive();
  const reference = ss.getSheetByName(RM.sheets.interestReference);
  const interests = new Map();
  if (reference && reference.getLastRow() >= 2) {
    const values = reference.getDataRange().getDisplayValues();
    const h = headerMap_(values[0]);
    const codeI=h.indexOf('student code'), titleI=h.indexOf('club title'), sectionI=h.indexOf('section label'), levelI=h.indexOf('interest level'), scoreI=h.indexOf('interest score'), maxI=h.indexOf('max clubs');
    values.slice(1).forEach(function(row){
      const code=codeI>=0?String(row[codeI]||'').trim():'';
      const title=titleI>=0?String(row[titleI]||'').trim():'';
      const section=sectionI>=0?String(row[sectionI]||'').trim():'';
      if(!code||!title)return;
      const display=section?title+' ('+section+')':title;
      const key=normalizeClubEditorKey_(display);
      const score=scoreI>=0?Number(row[scoreI]||0):0;
      if(score<=0)return;
      const list=interests.get(key)||[];
      list.push({code:code,interest:score>=2?'Definitely':'Maybe',maxClubs:maxI>=0?String(row[maxI]||''):''});
      interests.set(key,list);
    });
    return interests;
  }
  const sheet = ss.getSheetByName(RM.sheets.codedChoices) || ss.getSheetByName('Coded Choices Export');
  if (!sheet || sheet.getLastRow() < 2) return interests;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(String), normalized = headers.map(normalize_);
  const codeI = normalized.indexOf('student code') >= 0 ? normalized.indexOf('student code') : normalized.indexOf('student_code');
  const maxI = normalized.indexOf('max clubs') >= 0 ? normalized.indexOf('max clubs') : normalized.indexOf('max_clubs');
  values.slice(1).forEach(function(row){
    const code=codeI>=0?String(row[codeI]||'').trim():'';if(!code)return;
    const maxClubs=maxI>=0?String(row[maxI]||'').replace(/[^0-9]/g,''):'';
    for(var col=5;col<headers.length;col+=1){const club=String(headers[col]||'').trim();if(!club)continue;const interest=normalizeInterestResponse_(row[col]);if(['Definitely','Maybe'].indexOf(interest)<0)continue;const key=normalizeClubEditorKey_(club),list=interests.get(key)||[];list.push({code:code,interest:interest,maxClubs:maxClubs});interests.set(key,list);}
  });
  return interests;
}

function countStudentAssignmentsForEditor_(studentCode, assignments) {
  let count = 0;
  assignments.forEach(list => {
    if (list.some(item => item.code === studentCode)) count += 1;
  });
  return count;
}

function editorInterestRank_(interest) {
  if (interest === 'Definitely') return 2;
  if (interest === 'Maybe') return 1;
  return 0;
}

function normalizeClubEditorKey_(value) {
  return normalize_(String(value || '').replace(/\s*\([^)]*\)\s*$/, '') || value);
}

function getReviewCenterData() { return getWorkflowState(); }

function openWorkbookSheet(name) { const sheet=SpreadsheetApp.getActive().getSheetByName(String(name||'')); if(!sheet) throw new Error('Sheet is not available yet.'); sheet.showSheet(); sheet.activate(); return true; }
function refreshRosterReviewFast() {
  operationStart_('Refresh roster review','Reading roster data');
  try {
    const model=buildModel_(); const validation=validateWorkingRoster_(model);
    writeStudentsReview_(model); writeClubRosters_(model); writeFinalChecks_(model,validation);
    operationFinish_('Roster review updated',validation.blocking.length?'review':'completed');
    setStatus_('last_refresh',new Date().toISOString()); SpreadsheetApp.flush(); return getReviewCenterData();
  } catch(error) { operationFinish_(error instanceof Error?error.message:String(error),'failed'); throw error; }
}
function refreshFinalChecksFast() {
  operationStart_('Run final checks','Checking roster rules');
  try { const model=buildModel_(); const validation=validateWorkingRoster_(model); writeFinalChecks_(model,validation); if(!validation.blocking.length) writeFinalCoded_(model); operationFinish_(validation.blocking.length+' blocking problems found',validation.blocking.length?'review':'completed'); SpreadsheetApp.flush(); return getReviewCenterData(); }
  catch(error){operationFinish_(error instanceof Error?error.message:String(error),'failed');throw error;}
}
function applyRosterChangeFast(payload) {
  const result=applyRosterChange(payload); return result;
}

function getDashboardData() {
  const model = buildModel_();
  const validation = validateWorkingRoster_(model);
  return {
    studentsNeedingReview: model.reviewRows.filter(r => r.reviewStatus !== 'Reviewed').length,
    clubs: model.clubList.length,
    blockingChecks: validation.blocking.length,
    advisoryChecks: validation.advisory.length,
    lastRefresh: getStatus_('last_refresh') || '',
    tabs: RM.sheets
  };
}

function getStudentsNeedingReview(query) {
  const q = normalize_(query || '');
  return buildModel_().reviewRows
    .filter(r => !q || normalize_([r.name,r.homeroom,r.reason].join(' ')).includes(q))
    .map(r => ({code:r.code,name:r.name,grade:r.grade,homeroom:r.homeroom,requested:r.requested,assigned:r.assignedCount,reason:r.reason,reviewStatus:r.reviewStatus}));
}

function getStudentDetail(studentCode) {
  const model = buildModel_();
  const student = model.students.get(String(studentCode));
  if (!student) throw new Error('Student was not found in Student Map.');
  const assignments = model.assignments.filter(a => a.studentCode === student.code);
  const choices = model.choices.get(student.code) || [];
  return {
    student,
    assignments,
    choices: choices.map(c => ({...c, assignedCount:model.assignmentCounts.get(clubKey_(c.clubTitle,c.sectionLabel)) || 0})),
    reviewStatus: getReviewStatus_(student.code)
  };
}

function searchStudents(query) {
  const q = normalize_(query);
  if (!q) return [];
  return [...buildModel_().students.values()]
    .filter(s => normalize_([s.name,s.homeroom,s.grade].join(' ')).includes(q))
    .slice(0,25);
}

function getClubs() {
  const model = buildModel_();
  return model.clubList.map(c => ({...c, assignedCount:model.assignmentCounts.get(c.key)||0}));
}

function getClubDetail(clubKey) {
  const model = buildModel_();
  const club = model.clubList.find(c => c.key === clubKey);
  if (!club) throw new Error('Club was not found.');
  const roster = model.assignments.filter(a => clubKey_(a.clubTitle,a.sectionLabel) === clubKey);
  const interested = [];
  model.choices.forEach((choices, code) => {
    const hit = choices.find(c => clubKey_(c.clubTitle,c.sectionLabel) === clubKey && Number(c.interestScore) > 0);
    if (!hit) return;
    const student = model.students.get(code);
    if (student && !roster.some(r => r.studentCode === code)) {
      interested.push({...student,interestScore:Number(hit.interestScore),interestLevel:hit.interestLevel});
    }
  });
  interested.sort((a,b) => b.interestScore-a.interestScore || a.name.localeCompare(b.name));
  return {club, roster, interested};
}

function applyRosterChange(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const action = String(payload.action || '');
    const code = String(payload.studentCode || '').trim();
    const note = String(payload.note || '').trim();
    const model = buildModel_();
    const student = model.students.get(code);
    if (!student) throw new Error('Student was not found.');

    let assignments = dedupeAssignments_(model.assignments).assignments;
    let fromClub = '';
    let toClub = '';

    if (action === 'add') {
      const target = resolveClub_(model, payload.toClubKey);
      if (assignments.some(a => a.studentCode===code && clubKey_(a.clubTitle,a.sectionLabel)===target.key)) {
        throw new Error('Student is already in this club.');
      }
      assignments.push(assignmentFor_(student,target.title,target.section,note));
      toClub = displayClub_(target.title,target.section);
    } else if (action === 'remove') {
      const fromKey = normalizeClubKey_(payload.fromClubKey);
      const idx = assignments.findIndex(a => a.studentCode===code && clubKey_(a.clubTitle,a.sectionLabel)===fromKey);
      if (idx < 0) throw new Error('Current assignment was not found.');
      fromClub = displayClub_(assignments[idx].clubTitle,assignments[idx].sectionLabel);
      assignments.splice(idx,1);
    } else if (action === 'move') {
      const fromKey = normalizeClubKey_(payload.fromClubKey);
      const idx = assignments.findIndex(a => a.studentCode===code && clubKey_(a.clubTitle,a.sectionLabel)===fromKey);
      if (idx < 0) throw new Error('Current assignment was not found.');
      const target = resolveClub_(model, payload.toClubKey);
      if (assignments.some(a => a.studentCode===code && clubKey_(a.clubTitle,a.sectionLabel)===target.key)) {
        throw new Error('Student is already in the destination club.');
      }
      fromClub = displayClub_(assignments[idx].clubTitle,assignments[idx].sectionLabel);
      assignments[idx] = assignmentFor_(student,target.title,target.section,note);
      toClub = displayClub_(target.title,target.section);
    } else if (action === 'review') {
      setReviewStatus_(code,'Reviewed',note);
      appendHistory_('Marked reviewed',student,'','',note);
      refreshRosterManager();
      return getStudentDetail(code);
    } else {
      throw new Error('Unknown roster action.');
    }

    validateProgrammaticAssignments_(assignments, model.students, model.clubMap);
    setReviewStatus_(code, 'Needs review', '');
    writeNamedAssignments_(assignments);
    appendHistory_(action==='add'?'Added':action==='remove'?'Removed':'Moved',student,fromClub,toClub,note);
    refreshRosterManager();
    return getStudentDetail(code);
  } finally {
    lock.releaseLock();
  }
}

function buildModel_() {
  const ss = SpreadsheetApp.getActive();
  const students = readStudents_(ss);
  const rawRoster = readPhysicalNamedRoster_(ss.getSheetByName(RM.sheets.finalNamed), students);
  let assignments = rawRoster.assignments;

  if (assignments.length === 0 && rawRoster.nonBlankRowCount === 0) {
    assignments = readPhysicalNamedRoster_(ss.getSheetByName(RM.sheets.draftNamed), students).assignments;
  }

  const choices = readInterestReference_(ss);
  if (choices.size === 0) readChoices_(ss).forEach((value,key) => choices.set(key,value));

  const requestedCounts = readRequestedCounts_(ss);
  choices.forEach((items, code) => {
    const max = items.reduce((value,item) => Math.max(value,Number(item.maxClubs||0)),0);
    if (max > 0) requestedCounts.set(code,max);
  });
  requestedCounts.forEach((maxClubs,code) => {
    const student=students.get(code);
    if(student) student.maxClubs=maxClubs;
  });

  const clubMap = readClubReference_(ss);
  const referenceAvailable = clubMap.size > 0;
  if (!referenceAvailable) {
    assignments.forEach(a => clubMap.set(clubKey_(a.clubTitle,a.sectionLabel),basicClub_(a.clubTitle,a.sectionLabel)));
    choices.forEach(list => list.forEach(c => clubMap.set(clubKey_(c.clubTitle,c.sectionLabel),basicClub_(c.clubTitle,c.sectionLabel))));
  }

  const assignmentCounts = new Map();
  assignments.forEach(a => {
    const key=clubKey_(a.clubTitle,a.sectionLabel);
    assignmentCounts.set(key,(assignmentCounts.get(key)||0)+1);
  });

  const reviewRows=[];
  students.forEach(student => {
    const assigned=assignments.filter(a=>a.studentCode===student.code);
    const studentChoices=choices.get(student.code)||[];
    const high=studentChoices.filter(c=>Number(c.interestScore)>=2);
    const highReceived=assigned.some(a=>high.some(c=>clubKey_(c.clubTitle,c.sectionLabel)===clubKey_(a.clubTitle,a.sectionLabel)));
    const reasons=[];
    if(student.maxClubs>0 && assigned.length===0) reasons.push('No club assigned');
    if(assigned.length<student.maxClubs) reasons.push('Fewer clubs than requested');
    if(high.length>0 && !highReceived) reasons.push('No high-interest club');
    if(reasons.length) reviewRows.push({code:student.code,name:student.name,grade:student.grade,homeroom:student.homeroom,requested:student.maxClubs,assignedCount:assigned.length,highReceived,reason:reasons.join('; '),reviewStatus:getReviewStatus_(student.code)});
  });

  return {
    ss,students,assignments,choices,assignmentCounts,clubMap,referenceAvailable,
    clubList:[...clubMap.values()].sort((a,b)=>displayClub_(a.title,a.section).localeCompare(displayClub_(b.title,b.section))),
    reviewRows,rawRows:rawRoster.rows,parseIssues:rawRoster.issues
  };
}

function readStudents_(ss) {
  const sheet=requiredSheet_(ss,RM.sheets.studentMap);
  const values=sheet.getDataRange().getDisplayValues();
  if(!values.length)return new Map();
  const h=headerMap_(values[0]);
  const codeI=findHeader_(h,RM.aliases.studentCode),nameI=findHeader_(h,RM.aliases.studentName),gradeI=findHeader_(h,RM.aliases.grade),homeI=findHeader_(h,RM.aliases.homeroom),maxI=findHeader_(h,RM.aliases.maxClubs);
  if(codeI<0)throw new Error('Student Map is missing student_code.');
  const out=new Map();
  values.slice(1).forEach(r=>{
    const code=String(r[codeI]||'').trim(); if(!code)return;
    out.set(code,{code,name:nameI>=0?String(r[nameI]||code).trim():code,grade:gradeI>=0?String(r[gradeI]||'').trim():'',homeroom:homeI>=0?String(r[homeI]||'').trim():'',maxClubs:maxI>=0?Math.max(0,parseInt(r[maxI]||'0',10)||0):1});
  });
  return out;
}

function readPhysicalNamedRoster_(sheet, students) {
  const result={rows:[],assignments:[],issues:[],nonBlankRowCount:0};
  if(!sheet)return result;
  const values=sheet.getDataRange().getDisplayValues();
  if(values.length<2)return result;
  const h=headerMap_(values[0]);
  const ci=findHeader_(h,RM.aliases.studentCode),ni=findHeader_(h,RM.aliases.studentName),gi=findHeader_(h,RM.aliases.grade),hi=findHeader_(h,RM.aliases.homeroom),ti=findHeader_(h,RM.aliases.clubTitle),si=findHeader_(h,RM.aliases.sectionLabel),noi=findHeader_(h,RM.aliases.notes);
  if(ti<0){result.issues.push('Final Named Rosters is missing club_title.');return result;}

  const studentsByIdentity=new Map();
  students.forEach(student=>{
    const key=studentIdentityKey_(student.name,student.grade,student.homeroom);
    const list=studentsByIdentity.get(key)||[]; list.push(student); studentsByIdentity.set(key,list);
  });

  values.slice(1).forEach((r,index)=>{
    const rowNumber=index+2;
    const cells=r.map(v=>String(v||'').trim());
    if(!cells.some(Boolean))return;
    result.nonBlankRowCount+=1;

    const clubTitle=String(r[ti]||'').trim();
    const sectionLabel=si>=0?String(r[si]||'').trim():'';
    const studentName=ni>=0?String(r[ni]||'').trim():'';
    const grade=gi>=0?String(r[gi]||'').trim():'';
    const homeroom=hi>=0?String(r[hi]||'').trim():'';
    let studentCode=ci>=0?String(r[ci]||'').trim():'';
    const notes=noi>=0?String(r[noi]||'').trim():'';

    if(!studentCode && studentName){
      const candidates=studentsByIdentity.get(studentIdentityKey_(studentName,grade,homeroom))||[];
      if(candidates.length===1)studentCode=candidates[0].code;
      else if(candidates.length===0)result.issues.push(`Row ${rowNumber}: student identity is missing and the visible student information does not match Student Map.`);
      else result.issues.push(`Row ${rowNumber}: student identity is missing and the visible student information matches more than one student.`);
    }

    if(!clubTitle)result.issues.push(`Row ${rowNumber}: club_title is missing.`);
    if(!studentCode)result.issues.push(`Row ${rowNumber}: student identity is missing. Use the Roster Manager to add the student, or copy the complete row including hidden columns.`);

    const knownStudent=studentCode?students.get(studentCode):null;
    if(studentCode && !knownStudent)result.issues.push(`Row ${rowNumber}: student_code is not found in Student Map.`);
    if(knownStudent && studentName && normalize_(knownStudent.name)!==normalize_(studentName))result.issues.push(`Row ${rowNumber}: visible student name does not match the hidden student identity.`);

    const row={rowNumber,clubTitle,sectionLabel,studentCode,studentName:knownStudent?knownStudent.name:studentName,grade:knownStudent?knownStudent.grade:grade,homeroom:knownStudent?knownStudent.homeroom:homeroom,notes};
    result.rows.push(row);
    if(clubTitle&&studentCode&&knownStudent)result.assignments.push(row);
  });
  return result;
}

function readRequestedCounts_(ss) {
  const sheet=ss.getSheetByName(RM.sheets.codedChoices),out=new Map();
  if(!sheet)return out;
  const values=sheet.getDataRange().getDisplayValues();if(values.length<2)return out;
  const h=headerMap_(values[0]),codeI=findHeader_(h,RM.aliases.studentCode),maxI=findHeader_(h,RM.aliases.maxClubs);
  if(codeI<0||maxI<0)return out;
  values.slice(1).forEach(r=>{const code=String(r[codeI]||'').trim();if(!code)return;const n=parseInt(String(r[maxI]||'0'),10);out.set(code,Number.isFinite(n)?Math.max(0,n):0);});
  return out;
}

function readClubReference_(ss) {
  const out=new Map(),sheet=ss.getSheetByName(RM.sheets.clubReference);if(!sheet)return out;
  const values=sheet.getDataRange().getDisplayValues();if(values.length<2)return out;
  const h=headerMap_(values[0]);
  const idI=h.indexOf('club id'),titleI=h.indexOf('club title'),sectionI=h.indexOf('section label'),daysI=h.indexOf('meeting days'),sponsorI=h.indexOf('sponsor name'),typeI=h.indexOf('capacity type'),maxI=h.indexOf('max capacity'),minI=h.indexOf('minimum viable enrollment'),limitedI=h.indexOf('grade limited'),gradesI=h.indexOf('eligible grades'),prefI=h.indexOf('matching preference'),activeI=h.indexOf('is active');
  if(titleI<0)return out;
  values.slice(1).forEach(r=>{
    const title=String(r[titleI]||'').trim();if(!title)return;
    if(activeI>=0&&['false','no','0'].includes(normalize_(r[activeI])))return;
    const section=sectionI>=0?String(r[sectionI]||'').trim():'';const key=clubKey_(title,section);
    out.set(key,{key,id:idI>=0?String(r[idI]||'').trim():'',title,section,meetingDays:daysI>=0?splitList_(r[daysI]):[],sponsorName:sponsorI>=0?String(r[sponsorI]||'').trim():'',capacityType:typeI>=0?normalize_(r[typeI]):'',maxCapacity:maxI>=0?Number(r[maxI]||0):0,minimum:minI>=0?Number(r[minI]||0):0,gradeLimited:limitedI>=0&&['true','yes','1'].includes(normalize_(r[limitedI])),eligibleGrades:gradesI>=0?splitList_(r[gradesI]).map(String):[],matchingPreference:prefI>=0?String(r[prefI]||'').trim():''});
  });
  return out;
}

function readInterestReference_(ss) {
  const out=new Map(),sheet=ss.getSheetByName(RM.sheets.interestReference);if(!sheet)return out;
  const values=sheet.getDataRange().getDisplayValues();if(values.length<2)return out;
  const h=headerMap_(values[0]);const codeI=h.indexOf('student code'),idI=h.indexOf('club id'),titleI=h.indexOf('club title'),sectionI=h.indexOf('section label'),levelI=h.indexOf('interest level'),scoreI=h.indexOf('interest score'),topI=h.indexOf('is top choice'),maxI=h.indexOf('max clubs');
  if(codeI<0||titleI<0)return out;
  values.slice(1).forEach(r=>{const code=String(r[codeI]||'').trim(),title=String(r[titleI]||'').trim();if(!code||!title)return;const item={clubId:idI>=0?String(r[idI]||'').trim():'',clubTitle:title,sectionLabel:sectionI>=0?String(r[sectionI]||'').trim():'',interestLevel:levelI>=0?String(r[levelI]||'').trim():'',interestScore:scoreI>=0?Number(r[scoreI]||0):0,isTopChoice:topI>=0&&['true','yes','1'].includes(normalize_(r[topI])),maxClubs:maxI>=0?Number(r[maxI]||0):0};const list=out.get(code)||[];list.push(item);out.set(code,list);});
  return out;
}

function readChoices_(ss) {
  const sheet=ss.getSheetByName(RM.sheets.codedChoices),out=new Map();if(!sheet)return out;
  const values=sheet.getDataRange().getDisplayValues();if(values.length<2)return out;
  const headers=values[0].map(String),h=headerMap_(headers),ci=findHeader_(h,RM.aliases.studentCode);if(ci<0)return out;
  const metadata=new Set(['student code','grade','homeroom code','max clubs','top choice']);
  values.slice(1).forEach(r=>{const code=String(r[ci]||'').trim();if(!code)return;const list=[];headers.forEach((raw,i)=>{if(metadata.has(normalizeHeader_(raw)))return;const level=String(r[i]||'').trim(),score=interestScore_(level);if(score>0)list.push({clubTitle:String(raw).trim(),sectionLabel:'',interestLevel:level,interestScore:score,maxClubs:0});});out.set(code,list);});return out;
}

function validateWorkingRoster_(model) {
  const blocking=[...model.parseIssues],advisory=[];
  const duplicateRows=new Map();

  model.assignments.forEach(a=>{
    const key=a.studentCode+'|'+clubKey_(a.clubTitle,a.sectionLabel);
    const rows=duplicateRows.get(key)||[];rows.push(a.rowNumber);duplicateRows.set(key,rows);

    if(model.referenceAvailable&&!model.clubMap.has(clubKey_(a.clubTitle,a.sectionLabel)))blocking.push(`Row ${a.rowNumber}: club and section are not recognized: ${displayClub_(a.clubTitle,a.sectionLabel)}.`);

    const club=model.clubMap.get(clubKey_(a.clubTitle,a.sectionLabel));
    const student=model.students.get(a.studentCode);
    if(club&&student&&club.gradeLimited&&club.eligibleGrades.length&&!club.eligibleGrades.includes(String(student.grade)))blocking.push(`Row ${a.rowNumber}: ${student.name} is not grade eligible for ${displayClub_(club.title,club.section)}.`);
  });

  duplicateRows.forEach(rows=>{if(rows.length>1)blocking.push(`Rows ${rows.join(', ')}: duplicate student and club assignment.`);});

  model.clubList.forEach(club=>{
    const count=model.assignmentCounts.get(club.key)||0;
    if(club.capacityType==='limited'&&club.maxCapacity>0&&count>club.maxCapacity)advisory.push(`${displayClub_(club.title,club.section)} is ${count-club.maxCapacity} over capacity (${count}/${club.maxCapacity}). Confirm this is intentional before final sync.`);
    if(club.minimum>0&&count<club.minimum)advisory.push(`${displayClub_(club.title,club.section)} is ${club.minimum-count} below minimum (${count}/${club.minimum}).`);
  });

  const byStudent=new Map();model.assignments.forEach(a=>{const list=byStudent.get(a.studentCode)||[];list.push(a);byStudent.set(a.studentCode,list);});
  byStudent.forEach((items,code)=>{
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const c1=model.clubMap.get(clubKey_(items[i].clubTitle,items[i].sectionLabel));
      const c2=model.clubMap.get(clubKey_(items[j].clubTitle,items[j].sectionLabel));
      if(!c1||!c2)continue;
      const conflict=c1.meetingDays.some(day=>c2.meetingDays.includes(day));
      if(conflict)blocking.push(`Rows ${items[i].rowNumber} and ${items[j].rowNumber}: student has a meeting-day conflict between ${displayClub_(c1.title,c1.section)} and ${displayClub_(c2.title,c2.section)}.`);
    }
  });

  return {blocking:unique_(blocking),advisory:unique_(advisory)};
}

function computeChecks_(model,validation) {
  const over=[...model.clubMap.values()].filter(c=>c.capacityType==='limited'&&c.maxCapacity>0&&(model.assignmentCounts.get(c.key)||0)>c.maxCapacity).length;
  const below=[...model.clubMap.values()].filter(c=>c.minimum>0&&(model.assignmentCounts.get(c.key)||0)<c.minimum).length;
  return [
    {level:'Blocking',check:'Roster errors',count:validation.blocking.length,status:validation.blocking.length?'Fix before sync':'Clear',details:validation.blocking.join(' | ')||'No blocking roster errors.'},
    {level:'Advisory',check:'Over-capacity clubs',count:over,status:over?'Confirm intentional':'Clear',details:'Over capacity is allowed only as an intentional coordinator decision.'},
    {level:'Advisory',check:'Below-minimum clubs',count:below,status:below?'Review':'Clear',details:'Review before finalizing.'},
    {level:'Advisory',check:'No club assigned',count:model.reviewRows.filter(r=>r.reason.includes('No club assigned')).length,status:'Review',details:'Student requested a club and received none.'},
    {level:'Advisory',check:'Fewer clubs than requested',count:model.reviewRows.filter(r=>r.reason.includes('Fewer clubs')).length,status:'Review',details:'Student received fewer clubs than requested.'},
    {level:'Advisory',check:'No high-interest club',count:model.reviewRows.filter(r=>r.reason.includes('No high-interest')).length,status:'Review',details:'Student did not receive a high-interest club.'}
  ];
}

function writeFinalChecks_(model,validation) {
  const sheet = ensureSheet_(model.ss, RM.sheets.finalChecks, [RM.checkHeaders]);
  const findings = buildRosterFindings_(model, validation);
  const rows = [RM.checkHeaders];

  findings.forEach(finding => {
    rows.push([
      finding.severity,
      finding.studentName,
      finding.clubName,
      finding.rows.join(', '),
      finding.message,
      finding.suggestedFix,
      finding.severity === 'Blocking' ? 'Needs correction' : 'Review',
      '',
    ]);
  });

  if (findings.length === 0) {
    rows.push(['Clear','','','','No roster problems found.','','Clear','']);
  }

  sheet.clearContents();
  sheet.getRange(1,1,rows.length,RM.checkHeaders.length).setValues(rows);
  formatHeader_(sheet, RM.checkHeaders.length);

  const targetSheet = model.ss.getSheetByName(RM.sheets.finalNamed);
  if (targetSheet) {
    findings.forEach((finding,index) => {
      if (!finding.rows.length) return;
      const rowNumber = finding.rows[0];
      sheet.getRange(index + 2, 8).setFormula(
        `=HYPERLINK("#gid=${targetSheet.getSheetId()}&range=A${rowNumber}","Open row ${rowNumber}")`
      );
    });
  }
}

function writeClubSizeCheck_(model,validation) {
  const sheet=ensureSheet_(model.ss,RM.sheets.clubSizeCheck,[RM.clubSizeHeaders]);
  const rows=[RM.clubSizeHeaders].concat(model.clubList.map(club=>{
    const count=model.assignmentCounts.get(club.key)||0;
    const capacity=club.capacityType==='unlimited'?'Unlimited':club.maxCapacity||'';
    const over=club.capacityType==='limited'&&club.maxCapacity>0?Math.max(0,count-club.maxCapacity):0;
    const below=club.minimum>0?Math.max(0,club.minimum-count):0;
    return [club.title,club.section,capacity,club.minimum||'',count,over,below,over?'Over capacity - confirm intentional':below?'Below minimum':'OK',''];
  }));
  sheet.clearContents();sheet.getRange(1,1,rows.length,RM.clubSizeHeaders.length).setValues(rows);formatHeader_(sheet,RM.clubSizeHeaders.length);
}

function writeNamedAssignments_(assignments) {
  const sheet=ensureSheet_(SpreadsheetApp.getActive(),RM.sheets.finalNamed,[RM.finalNamedHeaders]);
  const rows=[RM.finalNamedHeaders].concat(assignments.map(a=>[a.clubTitle,a.sectionLabel,a.studentName,a.grade,a.homeroom,a.studentCode,a.notes||'']));
  sheet.clearContents();sheet.getRange(1,1,rows.length,7).setValues(rows);formatHeader_(sheet,7);
}

function writeFinalCoded_(model) {
  const sheet=ensureSheet_(model.ss,RM.sheets.finalCoded,[RM.finalCodedHeaders]),order=new Map(),rows=[RM.finalCodedHeaders];
  model.assignments.forEach(a=>{const n=(order.get(a.studentCode)||0)+1;order.set(a.studentCode,n);rows.push([a.studentCode,a.clubTitle,a.sectionLabel,n]);});
  sheet.clearContents();sheet.getRange(1,1,rows.length,4).setValues(rows);formatHeader_(sheet,4);
}

function writeStudentsReview_(model) {
  const sheet=ensureSheet_(model.ss,RM.sheets.studentsReview,[RM.reviewHeaders]);
  const rows=[RM.reviewHeaders].concat(model.reviewRows.map(r=>[r.name,r.grade,r.homeroom,r.requested,r.assignedCount,r.highReceived?'Yes':'No',r.reason,r.reviewStatus,r.code]));
  sheet.clearContents();sheet.getRange(1,1,rows.length,RM.reviewHeaders.length).setValues(rows);formatHeader_(sheet,RM.reviewHeaders.length);sheet.hideColumns(9);
}

function writeClubRosters_(model) {
  const sheet=ensureSheet_(model.ss,RM.sheets.clubRosters,[RM.rosterHeaders]),rows=[RM.rosterHeaders];
  model.clubList.forEach(c=>model.assignments.filter(a=>clubKey_(a.clubTitle,a.sectionLabel)===c.key).sort((a,b)=>a.studentName.localeCompare(b.studentName)).forEach(a=>rows.push([a.clubTitle,a.sectionLabel,a.studentName,a.grade,a.homeroom,a.notes||'',a.studentCode])));
  sheet.clearContents();sheet.getRange(1,1,rows.length,RM.rosterHeaders.length).setValues(rows);formatHeader_(sheet,RM.rosterHeaders.length);sheet.hideColumns(7);
}

function activateStartHere_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(RM.sheets.start) || ensureSheet_(ss, RM.sheets.start, [['Club Scheduler']]);
  sheet.activate();
}


function startHereStatus_() {
  const ss = SpreadsheetApp.getActive();
  const model = buildModel_();
  const validation = validateWorkingRoster_(model);
  const responseSheet = findFormResponseSheet_();
  const responseCount = responseSheet ? Math.max(0, responseSheet.getLastRow() - 1) : 0;
  const responseIssueSheet = ss.getSheetByName('Response Problems');
  const responseIssueCount = responseIssueSheet ? Math.max(0, responseIssueSheet.getLastRow() - 1) : 0;
  const draftSheet = ss.getSheetByName(RM.sheets.draftNamed);
  const draftCount = draftSheet ? Math.max(0, draftSheet.getLastRow() - 1) : 0;
  const finalSheet = ss.getSheetByName(RM.sheets.finalNamed);
  const finalCount = finalSheet ? Math.max(0, finalSheet.getLastRow() - 1) : 0;
  const lastRefresh = getStatus_('last_refresh') || getWorkbookSetting_('coded_choices_last_refresh') || '';
  const printableGenerated = getWorkbookSetting_('printable_rosters_last_generated') || '';
  const formId = getWorkbookSetting_('google_student_form_id');
  return {
    model,
    validation,
    responseCount,
    responseIssueCount,
    draftCount,
    finalCount,
    lastRefresh,
    printableGenerated,
    formConnected: Boolean(formId),
    clubDocUrl: getWorkbookSetting_('printable_club_rosters_doc_url'),
    homeroomDocUrl: getWorkbookSetting_('printable_homeroom_rosters_doc_url'),
    schedulerUrl: getWorkbookSetting_('scheduler_workflow_url') || getWorkbookSetting_('scheduler_url') || ''
  };
}

function startHereLinkFormula_(sheetName, label) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) return label + ' (not ready yet)';
  return '=HYPERLINK("#gid=' + sheet.getSheetId() + '","' + label.replace(/"/g,'""') + '")';
}

function writeStartHere_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ensureSheet_(ss, RM.sheets.start, [['Club Scheduler']]);
  const state = getWorkflowState();
  const yearLabel = getWorkbookSetting_('school_year_label') || 'School year';
  const blockLabel = getWorkbookSetting_('block_label') || 'Current session';
  let current = 'Run first-time setup';
  let detail = 'Open the Club Scheduler menu, open Google Workflow, and run First-time setup.';
  if (state.setupComplete) { current = 'Connect the student form'; detail = 'Connect the form, then prepare student choices after responses arrive.'; }
  if (state.draftCount) { current = 'Review draft rosters'; detail = 'Prepare the roster editor, make changes, and validate.'; }
  if (state.validatedAt) { current = 'Create printable rosters'; detail = 'Create and inspect both printable documents before finalizing.'; }
  const rows = [
    ['Club Scheduler',''], [yearLabel + ' | ' + blockLabel,''], ['Current step',current], ['',detail], ['',''],
    ['Workflow','Status'], ['1. Workbook setup',state.setupComplete ? 'Complete' : 'Not complete'],
    ['2. Student form',state.formId ? 'Created' : 'Not connected'], ['3. Student responses',String(state.responseCount || 0) + ' received'],
    ['4. Student choices',String(state.codedChoiceCount || 0) + ' ready'], ['5. Draft rosters',String(state.draftCount || 0) + ' rows'],
    ['6. Roster review',state.validatedAt ? 'Validated' : state.editorReady ? 'Editor ready' : 'Not started'],
    ['7. Printable rosters',state.printableAt ? 'Created' : 'Not created'], ['', ''],
    ['Open Google Workflow','Use the Club Scheduler menu for the guided workflow.']
  ];
  sheet.clear();
  sheet.getRange(1,1,rows.length,2).setValues(rows);
  sheet.setHiddenGridlines(true); sheet.setFrozenRows(2); sheet.setColumnWidth(1,260); sheet.setColumnWidth(2,500);
  sheet.getRange('A1:B1').merge().setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold').setFontSize(20);
  sheet.getRange('A2:B2').merge().setBackground('#E8EEF5').setFontColor(RM.colors.navy).setFontWeight('bold');
  sheet.getRange('A1:B' + rows.length).setFontFamily('Arial').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(3,1,2,2).setBackground('#E8EEF5'); sheet.getRange(3,1).setFontWeight('bold');
  sheet.getRange(6,1,1,2).setBackground('#F1F5F9').setFontWeight('bold');
  if (!state.setupComplete) sheet.getRange('A3:B4').setBackground(RM.colors.yellow).setFontColor('#7A4E00');
  sheet.activate();
}

function formatStartHereDate_(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
}
function applyRosterManagerFilters_(model) {
  [RM.sheets.finalNamed,RM.sheets.studentsReview,RM.sheets.clubRosters,RM.sheets.finalChecks,RM.sheets.changeHistory].forEach(name=>{
    const sheet=model.ss.getSheetByName(name);if(!sheet||sheet.getLastRow()<1||sheet.getLastColumn()<1)return;
    const existing=sheet.getFilter();if(existing)existing.remove();
    if(sheet.getLastRow()>=2)sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).createFilter();
  });
}

function applyFinalNamedValidation_(model) {
  const sheet=model.ss.getSheetByName(RM.sheets.finalNamed);if(!sheet)return;
  const values=sheet.getDataRange().getDisplayValues();if(!values.length)return;
  const h=headerMap_(values[0]),titleI=findHeader_(h,RM.aliases.clubTitle),sectionI=findHeader_(h,RM.aliases.sectionLabel),codeI=findHeader_(h,RM.aliases.studentCode);
  if(titleI<0||codeI<0)return;
  const titles=unique_(model.clubList.map(c=>c.title));
  const sections=unique_(model.clubList.map(c=>c.section).filter(Boolean));
  if(sheet.getMaxRows()>1&&titles.length){const rule=SpreadsheetApp.newDataValidation().requireValueInList(titles,true).setAllowInvalid(true).setHelpText('Choose an official club title, then refresh review pages.').build();sheet.getRange(2,titleI+1,sheet.getMaxRows()-1,1).setDataValidation(rule);}
  if(sectionI>=0&&sheet.getMaxRows()>1&&sections.length){const rule=SpreadsheetApp.newDataValidation().requireValueInList(sections,true).setAllowInvalid(true).setHelpText('Choose the matching section, then refresh review pages.').build();sheet.getRange(2,sectionI+1,sheet.getMaxRows()-1,1).setDataValidation(rule);}
  sheet.setFrozenRows(1);
  sheet.hideColumns(codeI+1);
  sheet.getRange(1,8).setValue('review_issue').setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold');
}

function protectTechnicalSheets_() {
  const ss=SpreadsheetApp.getActive();
  [RM.sheets.workflow,RM.sheets.clubReference,RM.sheets.interestReference,RM.sheets.finalCoded].forEach(name=>{const sheet=ss.getSheetByName(name);if(sheet&&!sheet.isSheetHidden())sheet.hideSheet();});
}

function buildRosterFindings_(model, validation) {
  const findings = [];

  validation.blocking.forEach(message => {
    findings.push(findingFromMessage_(model, 'Blocking', message));
  });

  validation.advisory.forEach(message => {
    findings.push(findingFromMessage_(model, 'Advisory', message));
  });

  return findings;
}

function findingFromMessage_(model, severity, message) {
  let rows = extractRowNumbers_(message);
  let clubName = '';
  let studentName = '';

  if (rows.length === 0 && severity === 'Advisory') {
    for (const club of model.clubList) {
      const display = displayClub_(club.title, club.section);
      if (message.indexOf(display + ' is ') === 0) {
        clubName = display;
        rows = model.assignments
          .filter(assignment => clubKey_(assignment.clubTitle, assignment.sectionLabel) === club.key)
          .map(assignment => assignment.rowNumber);
        break;
      }
    }
  }

  if (rows.length > 0) {
    const assignment = model.assignments.find(item => item.rowNumber === rows[0]);
    if (assignment) {
      studentName = assignment.studentName || '';
      clubName = clubName || displayClub_(assignment.clubTitle, assignment.sectionLabel);
    }
  }

  return {
    severity,
    message,
    rows: unique_(rows),
    studentName,
    clubName,
    suggestedFix: suggestedFixFor_(message),
  };
}

function extractRowNumbers_(message) {
  const prefix = String(message || '').match(/^Rows? ([0-9, ]+):/);
  if (!prefix) return [];
  return prefix[1]
    .split(',')
    .map(value => Number(String(value).trim()))
    .filter(value => Number.isFinite(value) && value > 1);
}

function suggestedFixFor_(message) {
  const normalized = normalize_(message);
  if (normalized.includes('duplicate student and club')) return 'Delete the duplicate row or choose a different club.';
  if (normalized.includes('club and section are not recognized')) return 'Choose a valid club title and matching section from the dropdowns.';
  if (normalized.includes('student identity is missing')) return 'Use the Roster Manager to add the student, or copy the complete row including hidden columns.';
  if (normalized.includes('student_code is not found')) return 'Restore the correct student row from Student Map or use the Roster Manager.';
  if (normalized.includes('visible student name does not match')) return 'Undo the pasted values or use the Roster Manager to move the correct student.';
  if (normalized.includes('not grade eligible')) return 'Move the student to an eligible club.';
  if (normalized.includes('meeting-day conflict')) return 'Move or remove one of the conflicting club assignments.';
  if (normalized.includes('over capacity')) return 'Confirm the overage is intentional or move a student to another club.';
  if (normalized.includes('below minimum')) return 'Review whether to keep, combine, or cancel the club.';
  return severityFixFallback_(normalized);
}

function severityFixFallback_(normalized) {
  return normalized ? 'Review the highlighted row and correct the roster entry.' : '';
}

function applyRosterIssueMarkup_(model, validation) {
  const sheet = model.ss.getSheetByName(RM.sheets.finalNamed);
  if (!sheet) return;

  const lastRow = Math.max(sheet.getLastRow(), 2);
  const issueColumn = 8;
  sheet.getRange(1, issueColumn).setValue('review_issue').setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold');

  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, issueColumn).setBackground(null);
    sheet.getRange(2, issueColumn, sheet.getMaxRows() - 1, 1).clearContent().clearNote();
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, 2).clearNote();
  }

  const messagesByRow = new Map();
  const severityByRow = new Map();
  const findings = buildRosterFindings_(model, validation);

  findings.forEach(finding => {
    finding.rows.forEach(rowNumber => {
      if (rowNumber < 2 || rowNumber > sheet.getMaxRows()) return;
      const messages = messagesByRow.get(rowNumber) || [];
      messages.push(finding.message);
      messagesByRow.set(rowNumber, messages);
      if (finding.severity === 'Blocking' || !severityByRow.has(rowNumber)) {
        severityByRow.set(rowNumber, finding.severity);
      }
    });
  });

  messagesByRow.forEach((messages,rowNumber) => {
    const severity = severityByRow.get(rowNumber);
    const message = unique_(messages).join('\n');
    const color = severity === 'Blocking' ? RM.colors.red : RM.colors.yellow;
    sheet.getRange(rowNumber, 1, 1, issueColumn).setBackground(color);
    sheet.getRange(rowNumber, issueColumn).setValue(message).setNote(message);
    sheet.getRange(rowNumber, 1).setNote(message);
  });

  sheet.setColumnWidth(issueColumn, 360);
}

function validateProgrammaticAssignments_(assignments,students,clubMap){const seen=new Set();assignments.forEach(a=>{if(!students.has(a.studentCode))throw new Error('Unknown student in roster.');const ck=clubKey_(a.clubTitle,a.sectionLabel);if(clubMap.size&&!clubMap.has(ck))throw new Error('Unknown club or section.');const key=a.studentCode+'|'+ck;if(seen.has(key))throw new Error('Duplicate student and club assignment.');seen.add(key);});}
function basicClub_(title,section){return{key:clubKey_(title,section),id:'',title,section,meetingDays:[],sponsorName:'',capacityType:'',maxCapacity:0,minimum:0,gradeLimited:false,eligibleGrades:[],matchingPreference:''};}
function assignmentFor_(s,title,section,note){return{rowNumber:0,studentCode:s.code,studentName:s.name,grade:s.grade,homeroom:s.homeroom,clubTitle:title,sectionLabel:section||'',notes:note||''};}
function normalizeClubKey_(key){const p=parseClubKey_(key);return clubKey_(p.title,p.section);}
function resolveClub_(model,key){const club=model.clubMap.get(normalizeClubKey_(key));if(!club)throw new Error('Destination club was not found. Refresh and try again.');return club;}
function dedupeAssignments_(assignments){const seen=new Set(),unique=[];let removedCount=0;assignments.forEach(a=>{const key=a.studentCode+'|'+clubKey_(a.clubTitle,a.sectionLabel);if(seen.has(key)){removedCount+=1;return;}seen.add(key);unique.push(a);});return{assignments:unique,removedCount};}
function appendHistory_(action,s,fromClub,toClub,note){const sheet=ensureSheet_(SpreadsheetApp.getActive(),RM.sheets.changeHistory,[RM.historyHeaders]);sheet.appendRow([new Date(),Session.getActiveUser().getEmail()||'Unknown',action,s.name,s.code,fromClub,toClub,note]);}
function getReviewStatus_(code){return getStatus_('review:'+code)||'Needs review';}
function setReviewStatus_(code,status,note){setStatus_('review:'+code,status);if(note)setStatus_('review-note:'+code,note);}
function setStatus_(key,value){const sheet=ensureSheet_(SpreadsheetApp.getActive(),RM.sheets.workflow,[RM.statusHeaders]),values=sheet.getDataRange().getValues();for(let i=1;i<values.length;i++){if(values[i][0]===key){sheet.getRange(i+1,2).setValue(value);return;}}sheet.appendRow([key,value]);}
function getStatus_(key){const sheet=SpreadsheetApp.getActive().getSheetByName(RM.sheets.workflow);if(!sheet)return'';const values=sheet.getDataRange().getValues();for(let i=1;i<values.length;i++)if(values[i][0]===key)return String(values[i][1]||'');return'';}
function ensureSheet_(ss,name,initial){let sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);if(sheet.getLastRow()===0&&initial){const rows=padRows_(initial);sheet.getRange(1,1,rows.length,rows[0].length).setValues(rows);}return sheet;}
function requiredSheet_(ss,name){const sheet=ss.getSheetByName(name);if(!sheet)throw new Error('Missing required sheet: '+name);return sheet;}
function padRows_(rows){const width=Math.max(...rows.map(r=>r.length));return rows.map(r=>r.concat(Array(width-r.length).fill('')));}
function headerMap_(row){return row.map(normalizeHeader_);}
function findHeader_(headers,aliases){for(const alias of aliases){const i=headers.indexOf(normalizeHeader_(alias));if(i>=0)return i;}return-1;}
function normalizeHeader_(v){return normalize_(v).replace(/_/g,' ');}
function normalize_(v){return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();}
function clubKey_(title,section){return normalize_(title)+'|'+normalize_(section);}
function parseClubKey_(key){const p=String(key||'').split('|');return{title:p[0]||'',section:p.slice(1).join('|')||''};}
function displayClub_(title,section){return[title,section].filter(Boolean).join(' - ');}
function studentIdentityKey_(name,grade,homeroom){return[normalize_(name),normalize_(grade),normalize_(homeroom)].join('|');}
function splitList_(v){return String(v||'').split(/[,;|]/).map(x=>x.trim()).filter(Boolean);}
function unique_(values){return[...new Set(values.filter(Boolean))];}
function interestScore_(v){const n=normalize_(v);if(['really want','really wants this','really_want','definitely','2'].includes(n))return 2;if(['would try','would try this','maybe','1'].includes(n))return 1;return 0;}
function formatHeader_(sheet,width){sheet.setFrozenRows(1);sheet.getRange(1,1,1,width).setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold');sheet.autoResizeColumns(1,width);}
function formatVisibleSheets_(){const ss=SpreadsheetApp.getActive();[RM.sheets.start,RM.sheets.studentsReview,RM.sheets.clubRosters,RM.sheets.finalChecks,RM.sheets.clubSizeCheck,RM.sheets.changeHistory].forEach(name=>{const sheet=ss.getSheetByName(name);if(sheet)sheet.showSheet();});}



function createPrintableRosterDocs() {
  operationStart_('Create printable rosters', 'Building club and homeroom Docs');
  const ss = SpreadsheetApp.getActive();
  const model = buildModel_();
  const validation = validateWorkingRoster_(model);
  if (validation.blocking.length > 0) {
    SpreadsheetApp.getUi().alert(
      'Printable rosters were not created. Fix the ' + validation.blocking.length +
      ' blocking roster problem' + (validation.blocking.length === 1 ? '' : 's') +
      ' shown in Final Checks, then try again.'
    );
    return;
  }
  if (!model.assignments.length) {
    SpreadsheetApp.getUi().alert('No final roster assignments were found. Finish roster review first.');
    return;
  }

  const yearLabel = getWorkbookSetting_('school_year_label') || getWorkbookSetting_('year_label') || 'School year';
  const blockLabel = getWorkbookSetting_('block_label') || 'Current session';
  const folder = printableRosterFolder_();
  const clubDoc = openOrCreateRosterDoc_({
    settingKey: 'printable_club_rosters_doc_id',
    name: yearLabel + ' ' + blockLabel + ' Club Rosters',
    folder: folder
  });
  const homeroomDoc = openOrCreateRosterDoc_({
    settingKey: 'printable_homeroom_rosters_doc_id',
    name: yearLabel + ' ' + blockLabel + ' Homeroom Rosters',
    folder: folder
  });

  const clubCount = writePrintableClubRosters_(clubDoc, model, yearLabel, blockLabel);
  const homeroomCount = writePrintableHomeroomRosters_(homeroomDoc, model, yearLabel, blockLabel);
  const clubUrl = clubDoc.getUrl();
  const homeroomUrl = homeroomDoc.getUrl();
  setWorkbookSetting_('printable_club_rosters_doc_url', clubUrl);
  setWorkbookSetting_('printable_homeroom_rosters_doc_url', homeroomUrl);
  setWorkbookSetting_('printable_rosters_last_generated', new Date().toISOString());
  applyCoordinatorWorkbookLayout_();
  SpreadsheetApp.flush();

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:18px;line-height:1.45">' +
    '<h2 style="margin-top:0">Printable rosters ready</h2>' +
    '<p>' + clubCount + ' club roster' + (clubCount === 1 ? '' : 's') + ' and ' +
    homeroomCount + ' homeroom roster' + (homeroomCount === 1 ? '' : 's') + ' were created.</p>' +
    '<p><a href="' + clubUrl + '" target="_blank">Open club rosters</a></p>' +
    '<p><a href="' + homeroomUrl + '" target="_blank">Open homeroom rosters</a></p>' +
    '<p style="color:#667085;font-size:12px">Running this again updates the same two documents.</p></div>'
  ).setWidth(430).setHeight(300);
  operationFinish_('Printable roster Docs are ready for inspection', 'completed');
  SpreadsheetApp.getUi().showModalDialog(html, 'Printable rosters');
  return getReviewCenterData();
}

function printableRosterFolder_() {
  const file = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  const parents = file.getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function openOrCreateRosterDoc_(options) {
  const savedId = getWorkbookSetting_(options.settingKey);
  if (savedId) {
    try {
      const doc = DocumentApp.openById(savedId);
      DriveApp.getFileById(savedId).setName(options.name);
      return doc;
    } catch (error) {
      console.warn('Saved printable Doc could not be opened; creating a replacement.', error);
    }
  }
  const doc = DocumentApp.create(options.name);
  const file = DriveApp.getFileById(doc.getId());
  options.folder.addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch (error) { console.warn(error); }
  setWorkbookSetting_(options.settingKey, doc.getId());
  return doc;
}

function resetPrintableDoc_(doc, title, subtitle) {
  const body = doc.getBody();
  body.clear();
  body.setPageWidth(612).setPageHeight(792).setMarginTop(42).setMarginBottom(42).setMarginLeft(54).setMarginRight(54);
  let header = doc.getHeader();
  if (!header) header = doc.addHeader();
  header.clear();
  const line = header.appendParagraph(title + '\n' + subtitle);
  line.setFontFamily('Arial').setFontSize(8).setForegroundColor('#475467').setSpacingBefore(0).setSpacingAfter(0);
  return body;
}

function writePrintableClubRosters_(doc, model, yearLabel, blockLabel) {
  const body = resetPrintableDoc_(doc, 'Club Rosters', yearLabel + ' | ' + blockLabel);
  const clubs = model.clubList.filter(club => model.assignments.some(a => clubKey_(a.clubTitle,a.sectionLabel) === club.key));
  clubs.forEach((club,index) => {
    if(index>0)body.appendPageBreak();
    const roster=model.assignments.filter(a=>clubKey_(a.clubTitle,a.sectionLabel)===club.key).sort((a,b)=>a.studentName.localeCompare(b.studentName));
    body.appendParagraph(displayClub_(club.title,club.section)).setHeading(DocumentApp.ParagraphHeading.HEADING1).setSpacingBefore(0).setSpacingAfter(4);
    const detail=[club.meetingDays&&club.meetingDays.length?club.meetingDays.join(', '):'',club.sponsorName||'',roster.length+' students'].filter(Boolean).join(' | ');
    body.appendParagraph(detail).setForegroundColor('#475467').setFontSize(9);
    const table=body.appendTable([['Student','Grade','Homeroom']].concat(roster.map(a=>[a.studentName,a.grade,a.homeroom])));
    formatPrintableTable_(table,[210,55,185]);
  });
  doc.saveAndClose();
  return clubs.length;
}

function writePrintableHomeroomRosters_(doc, model, yearLabel, blockLabel) {
  const body=resetPrintableDoc_(doc,'Homeroom Rosters',yearLabel+' | '+blockLabel);
  const groups=new Map();
  model.assignments.forEach(a=>{const name=String(a.homeroom||'No homeroom listed').trim();const list=groups.get(name)||[];const club=model.clubMap.get(clubKey_(a.clubTitle,a.sectionLabel));list.push({studentName:a.studentName,clubName:displayClub_(a.clubTitle,a.sectionLabel),meetingDays:club&&club.meetingDays?club.meetingDays.join(', '):''});groups.set(name,list);});
  const homerooms=[...groups.keys()].sort((a,b)=>a.localeCompare(b));
  homerooms.forEach((homeroom,index)=>{if(index>0)body.appendPageBreak();const rows=groups.get(homeroom).sort((a,b)=>a.studentName.localeCompare(b.studentName)||a.clubName.localeCompare(b.clubName));const studentCount=new Set(rows.map(r=>r.studentName)).size;body.appendParagraph(homeroom).setHeading(DocumentApp.ParagraphHeading.HEADING1).setSpacingBefore(0).setSpacingAfter(4);body.appendParagraph(studentCount+' student'+(studentCount===1?'':'s')).setForegroundColor('#475467').setFontSize(9).setSpacingBefore(0).setSpacingAfter(4);const table=body.appendTable([['Student','Club','Meeting day']].concat(rows.map(r=>[r.studentName,r.clubName,r.meetingDays])));formatPrintableTable_(table,[180,190,80]);});
  doc.saveAndClose();
  return homerooms.length;
}

function formatPrintableTable_(table, widths) {
  table.setAttributes({ [DocumentApp.Attribute.HORIZONTAL_ALIGNMENT]: DocumentApp.HorizontalAlignment.CENTER });
  table.setBorderColor('#D0D5DD').setBorderWidth(0.75);
  for (let rowIndex=0; rowIndex<table.getNumRows(); rowIndex++) {
    const row=table.getRow(rowIndex);
    for (let colIndex=0; colIndex<row.getNumCells(); colIndex++) {
      const cell=row.getCell(colIndex);
      cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(5).setPaddingRight(5);
      if (widths[colIndex]) cell.setWidth(widths[colIndex]);
      if (rowIndex===0) cell.setBackgroundColor('#16324F');
      const text=cell.editAsText();
      text.setFontFamily('Arial').setFontSize(9);
      if (rowIndex===0) text.setBold(true).setForegroundColor('#FFFFFF');
    }
  }
}


function canonicalGrade_(value) {
  const match = String(value || '').match(/[345]/);
  return match ? match[0] : String(value || '').trim();
}
function canonicalStudentIdentityKey_(name, grade, homeroom) {
  return [normalize_(name), canonicalGrade_(grade), normalize_(homeroom)].join('|');
}
function sharedRespondentEmails_(form, formResponses) {
  const questionMap = buildFormQuestionMapFromItems_(form);
  const identitiesByEmail = new Map();
  formResponses.forEach(function(response) {
    const answers = answersByItemId_(response);
    const email = normalize_(safeGetRespondentEmail_(response));
    const name = String(answers.get(questionMap.nameItemId) || '').trim();
    const grade = canonicalGrade_(answers.get(questionMap.gradeItemId));
    const homeroom = String(answers.get(questionMap.homeroomItemId) || '').trim();
    if (!email || !name || !grade || !homeroom) return;
    const identities = identitiesByEmail.get(email) || new Set();
    identities.add(canonicalStudentIdentityKey_(name, grade, homeroom));
    identitiesByEmail.set(email, identities);
  });
  const shared = new Set();
  identitiesByEmail.forEach(function(identities, email) { if (identities.size > 1) shared.add(email); });
  return shared;
}
function currentPaperCodeByIdentity_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Teacher-Entered Choices');
  const out = new Map();
  if (!sheet || sheet.getLastRow() < 7) return out;
  const headers = sheet.getRange(6,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(normalizeHeader_);
  const nameI=headers.indexOf('student name'), gradeI=headers.indexOf('grade'), homeI=headers.indexOf('homeroom'), codeI=headers.indexOf('student code');
  if(nameI<0||gradeI<0||homeI<0||codeI<0)return out;
  sheet.getRange(7,1,sheet.getLastRow()-6,sheet.getLastColumn()).getDisplayValues().forEach(function(row){
    const code=String(row[codeI]||'').trim(); if(!code)return;
    out.set(canonicalStudentIdentityKey_(row[nameI],row[gradeI],row[homeI]),code);
  });
  return out;
}
function currentCodedChoiceCodes_() {
  const sheet=SpreadsheetApp.getActive().getSheetByName(RM.sheets.codedChoices); const out=new Set();
  if(!sheet||sheet.getLastRow()<2)return out; const values=sheet.getDataRange().getDisplayValues();
  const headers=values[0].map(normalizeHeader_), codeI=headers.indexOf('student code');
  if(codeI>=0)values.slice(1).forEach(function(row){const code=String(row[codeI]||'').trim();if(code)out.add(code);});
  return out;
}
function archiveAndWriteCanonicalStudentMap_(spreadsheet, canonicalRows, aliases, archiveLabel) {
  const sheet=spreadsheet.getSheetByName(RM.sheets.studentMap); if(!sheet)throw new Error('Missing Student Map in '+spreadsheet.getName()+'.');
  const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd-HHmmss');
  let archiveName=('Student Map Archive '+stamp).slice(0,99); let suffix=2;
  while(spreadsheet.getSheetByName(archiveName))archiveName=('Student Map Archive '+stamp+' '+suffix++).slice(0,99);
  sheet.copyTo(spreadsheet).setName(archiveName);
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  sheet.clearContents(); sheet.getRange(1,1,1,headers.length).setValues([headers]);
  if(canonicalRows.length)sheet.getRange(2,1,canonicalRows.length,headers.length).setValues(canonicalRows);
  const aliasSheet=spreadsheet.getSheetByName('Student Code Aliases')||spreadsheet.insertSheet('Student Code Aliases');
  const aliasHeaders=['old_student_code','canonical_student_code','reason','consolidated_at'];
  const aliasRows=aliases.map(function(item){return[item.oldCode,item.canonicalCode,'Duplicate Student Map identity',new Date()];});
  aliasSheet.clearContents();aliasSheet.getRange(1,1,1,4).setValues([aliasHeaders]);
  if(aliasRows.length)aliasSheet.getRange(2,1,aliasRows.length,4).setValues(aliasRows);
  aliasSheet.hideSheet();
  return {archiveName:archiveName,canonicalCount:canonicalRows.length,aliasCount:aliases.length};
}
function rebuildCanonicalStudentMapForChoices_(form, formResponses) {
  const ss=SpreadsheetApp.getActive(), sheet=requiredSheet_(ss,RM.sheets.studentMap), values=sheet.getDataRange().getDisplayValues();
  const headers=headerMap_(values[0]||[]), codeI=findHeader_(headers,RM.aliases.studentCode), nameI=findHeader_(headers,RM.aliases.studentName), emailI=headers.indexOf('student email'), gradeI=findHeader_(headers,RM.aliases.grade), homeCodeI=headers.indexOf('homeroom code'), homeI=findHeader_(headers,RM.aliases.homeroom), activeI=headers.indexOf('active'), firstI=headers.indexOf('first seen block'), lastI=headers.indexOf('last seen block');
  if(codeI<0||nameI<0||gradeI<0||homeI<0)throw new Error('Student Map is missing required identity columns.');
  const shared=sharedRespondentEmails_(form,formResponses), paperCodes=currentPaperCodeByIdentity_(), codedCodes=currentCodedChoiceCodes_();
  const groups=new Map();
  values.slice(1).forEach(function(row,index){
    const code=String(row[codeI]||'').trim(); if(!code)return;
    const email=emailI>=0?normalize_(row[emailI]):''; const identity=canonicalStudentIdentityKey_(row[nameI],row[gradeI],row[homeI]);
    const key=email&&!shared.has(email)?'email:'+email:'identity:'+identity;
    const list=groups.get(key)||[];list.push({row:row.slice(),code:code,email:email,identity:identity,index:index});groups.set(key,list);
  });
  const canonical=[],aliases=[];
  groups.forEach(function(items){
    items.sort(function(a,b){
      const ap=paperCodes.get(a.identity)===a.code?1:0,bp=paperCodes.get(b.identity)===b.code?1:0;if(ap!==bp)return bp-ap;
      const ac=codedCodes.has(a.code)?1:0,bc=codedCodes.has(b.code)?1:0;if(ac!==bc)return bc-ac;return a.index-b.index;
    });
    const chosen=items[0], row=chosen.row.slice(); while(row.length<values[0].length)row.push('');
    row[gradeI]=canonicalGrade_(row[gradeI]); if(shared.has(chosen.email)&&emailI>=0)row[emailI]='';
    if(activeI>=0)row[activeI]='TRUE'; if(firstI>=0&&!row[firstI])row[firstI]=getWorkbookSetting_('block_label')||'form response'; if(lastI>=0)row[lastI]=getWorkbookSetting_('block_label')||'form response';
    canonical.push(row);
    items.slice(1).forEach(function(item){aliases.push({oldCode:item.code,canonicalCode:chosen.code});});
  });
  canonical.sort(function(a,b){return String(a[nameI]||'').localeCompare(String(b[nameI]||''));});
  const result=archiveAndWriteCanonicalStudentMap_(ss,canonical,aliases,'block');
  setWorkbookSetting_('student_map_year_sync_pending','TRUE');
  setWorkbookSetting_('student_map_canonical_count',String(canonical.length));setWorkbookSetting_('student_map_alias_count',String(aliases.length));setWorkbookSetting_('student_map_last_rebuilt',new Date().toISOString());
  return result;
}

function buildCodedChoicesFromFormApiResponses_(form, formResponses, students, officialClubs) {
  const questionMap = buildFormQuestionMapFromItems_(form);
  const mappedClubs = uniqueClubsFromQuestionMap_(questionMap);
  const outputClubs = officialClubs && officialClubs.length ? officialClubs : mappedClubs;
  const issues = [];

  if (!questionMap.nameItemId) issues.push([1, '', '', 'The form is missing the full-name question.', 'Expected: What is your full name?']);
  if (!questionMap.gradeItemId) issues.push([1, '', '', 'The form is missing the grade question.', 'Expected: What grade are you in?']);
  if (!questionMap.homeroomItemId) issues.push([1, '', '', 'The form is missing the homeroom question.', 'Expected: Who is your homeroom teacher?']);
  if (!questionMap.clubItems.length) issues.push([1, '', '', 'No club rating questions were found in the form.', 'Regenerate the student form from Scheduler.']);

  const responseRecords = formResponses.map(function(formResponse, index) {
    const answers = answersByItemId_(formResponse);
    const email = normalize_(safeGetRespondentEmail_(formResponse));
    const name = String(answers.get(questionMap.nameItemId) || '').trim();
    const grade = String(answers.get(questionMap.gradeItemId) || '').trim();
    const homeroom = String(answers.get(questionMap.homeroomItemId) || '').trim();
    return {
      formResponse: formResponse,
      answers: answers,
      responseIndex: index + 1,
      email: email,
      name: name,
      grade: grade,
      homeroom: homeroom,
      identityKey: responseIdentityKey_(name, grade, homeroom),
      timestamp: formResponse.getTimestamp ? formResponse.getTimestamp().getTime() : index + 1,
    };
  });

  const identitiesByEmail = new Map();
  responseRecords.forEach(function(record) {
    if (!record.email || !record.name || !record.grade || !record.homeroom) return;
    const identities = identitiesByEmail.get(record.email) || new Set();
    identities.add(record.identityKey);
    identitiesByEmail.set(record.email, identities);
  });
  const sharedEmails = new Set();
  identitiesByEmail.forEach(function(identities, email) {
    if (identities.size > 1) sharedEmails.add(email);
  });

  const byEmail = new Map();
  const byIdentity = new Map();
  students.forEach(function(student) {
    if (student.email && !sharedEmails.has(student.email)) {
      const emailStudents = byEmail.get(student.email) || [];
      emailStudents.push(student);
      byEmail.set(student.email, emailStudents);
    }
    const key = responseIdentityKey_(student.name, student.grade, student.homeroom);
    const list = byIdentity.get(key) || [];
    list.push(student);
    byIdentity.set(key, list);
  });

  const latest = new Map();
  let sharedEmailResponseCount = 0;
  let createdIdentityCount = 0;
  let reusedIdentityCount = 0;

  responseRecords.forEach(function(record) {
    const isSharedEmail = Boolean(record.email && sharedEmails.has(record.email));
    if (isSharedEmail) sharedEmailResponseCount += 1;

    if (!record.name || !record.grade || !record.homeroom) {
      issues.push([record.responseIndex, record.name, record.email, 'Required student identity information is missing.', 'The response must include full name, grade, and homeroom.']);
      return;
    }

    let student = null;
    const identityMatches = byIdentity.get(record.identityKey) || [];
    if (identityMatches.length === 1) {
      student = identityMatches[0];
    } else if (identityMatches.length > 1) {
      if (!isSharedEmail && record.email) {
        const matchingEmailIdentities = identityMatches.filter(function(candidate) {
          return candidate.email === record.email;
        });
        if (matchingEmailIdentities.length === 1) {
          student = matchingEmailIdentities[0];
        }
      }
      if (!student) {
        issues.push([record.responseIndex, record.name, isSharedEmail ? '' : record.email, 'Multiple existing students match this name, grade, and homeroom.', 'Review Student Map and correct the duplicate identity records.']);
        return;
      }
    }

    if (!student && !isSharedEmail && record.email) {
      const emailMatches = byEmail.get(record.email) || [];
      if (emailMatches.length === 1) {
        student = emailMatches[0];
      } else if (emailMatches.length > 1) {
        const exactEmailMatches = emailMatches.filter(function(candidate) {
          return responseIdentityKey_(candidate.name, candidate.grade, candidate.homeroom) === record.identityKey;
        });
        if (exactEmailMatches.length === 1) student = exactEmailMatches[0];
      }
    }

    const identityEmail = isSharedEmail ? '' : record.email;
    if (!student) {
      student = createStudentIdentityFromResponse_({
        name: record.name,
        email: identityEmail,
        grade: record.grade,
        homeroom: record.homeroom,
      });
      students.push(student);
      createdIdentityCount += 1;
      const identityList = byIdentity.get(record.identityKey) || [];
      identityList.push(student);
      byIdentity.set(record.identityKey, identityList);
      if (student.email && !sharedEmails.has(student.email)) {
        const emailList = byEmail.get(student.email) || [];
        emailList.push(student);
        byEmail.set(student.email, emailList);
      }
    } else {
      reusedIdentityCount += 1;
      student = Object.assign({}, student, {
        name: record.name,
        email: isSharedEmail ? '' : record.email,
        grade: canonicalGrade_(record.grade),
        homeroom: record.homeroom,
        homeroomCode: homeroomCodeFor_(record.homeroom),
      });
    }

    const existing = latest.get(student.code);
    if (!existing || record.timestamp >= existing.timestamp) {
      latest.set(student.code, {
        student: student,
        answers: record.answers,
        responseIndex: record.responseIndex,
        timestamp: record.timestamp,
      });
    }
  });

  const rows = [];
  latest.forEach(function(item) {
    const gradeMatch = String(item.student.grade || '').match(/[0-9]+/);
    const grade = gradeMatch ? gradeMatch[0] : '';
    const gradeClubItems = questionMap.clubItems.filter(function(itemMap) {
      return !grade || !itemMap.grade || String(itemMap.grade) === String(grade);
    });
    const hasEligibleClubQuestions = gradeClubItems.length > 0;
    const maxItemId = itemIdForGrade_(questionMap.maxItemsByGrade, grade);
    const topItemId = itemIdForGrade_(questionMap.topItemsByGrade, grade);
    const maxClubs = hasEligibleClubQuestions
      ? normalizeMaxClubAnswer_(item.answers.get(maxItemId) || '')
      : '0';
    const topChoice = hasEligibleClubQuestions
      ? canonicalClubChoice_(item.answers.get(topItemId) || '', outputClubs)
      : '';

    const ratingsByDisplay = new Map();
    questionMap.clubItems
      .filter(function(itemMap) {
        return !grade || !itemMap.grade || String(itemMap.grade) === String(grade);
      })
      .forEach(function(itemMap) {
        const raw = String(item.answers.get(String(itemMap.itemId)) || '').trim();
        if (!raw) return;
        bilingualClubAliases_(itemMap.display).forEach(function(key) {
          const list = ratingsByDisplay.get(key) || [];
          list.push(normalizeInterestResponse_(raw));
          ratingsByDisplay.set(key, list);
        });
      });

    const output = [
      item.student.code,
      item.student.grade,
      homeroomCodeFor_(item.student.homeroom),
      maxClubs,
      topChoice,
    ];

    outputClubs.forEach(function(club) {
      const keys = clubResponseKeys_(club);
      let answers = [];
      keys.forEach(function(key) {
        if (!answers.length && ratingsByDisplay.has(key)) answers = ratingsByDisplay.get(key) || [];
      });
      const distinct = Array.from(new Set(answers));
      if (distinct.length > 1) {
        issues.push([item.responseIndex, item.student.name, item.student.email || '', 'More than one rating was found for ' + club.display + ': ' + distinct.join(', '), 'Keep only one rating question for this club in the student grade section.']);
      }
      output.push(distinct.length ? strongestInterestResponse_(distinct) : 'No thanks');
    });

    if (hasEligibleClubQuestions && !maxClubs) issues.push([item.responseIndex, item.student.name, item.student.email || '', 'The number of clubs requested is missing.', 'Ask the student to answer how many clubs they would like to join.']);
    if (hasEligibleClubQuestions && !topChoice) issues.push([item.responseIndex, item.student.name, item.student.email || '', 'The top-choice club is missing.', 'Ask the student to answer which club they want most.']);
    rows.push(output);
  });

  rows.sort(function(left, right) {
    return String(left[0]).localeCompare(String(right[0]));
  });

  return {
    headers: baseCodedChoiceHeaders_(outputClubs),
    rows: rows,
    issues: issues,
    responseCount: formResponses.length,
    sharedEmailCount: sharedEmails.size,
    sharedEmailResponseCount: sharedEmailResponseCount,
    createdIdentityCount: createdIdentityCount,
    reusedIdentityCount: reusedIdentityCount,
    collapsedDuplicateResponseCount: Math.max(0, formResponses.length - latest.size),
    questionMapSummary: {
      clubs: questionMap.clubItems.length,
      maxQuestions: Object.keys(questionMap.maxItemsByGrade).length,
      topQuestions: Object.keys(questionMap.topItemsByGrade).length,
      parser: 'form_item_id_v10_1_local_transaction',
      sharedEmails: sharedEmails.size,
      sharedEmailResponses: sharedEmailResponseCount,
    },
  };
}


function connectStudentFormResponses() {
  operationStart_('Connect student form', 'Linking the form to this workbook');
  const ss = SpreadsheetApp.getActive();
  try {
    const formId = getWorkbookSetting_('google_student_form_id');
    if (!formId) throw new Error('Create and publish the student form in Scheduler first. Then return here and connect it.');
    const form = FormApp.openById(formId);
    let destinationId = '';
    try { destinationId = form.getDestinationId() || ''; } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (!message.toLowerCase().includes('no response destination')) throw error;
    }
    if (destinationId !== ss.getId()) form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    ensureFormSubmitTrigger_();
    Utilities.sleep(1500);
    const responseSheet = normalizeFormResponseSheet_();
    setWorkbookSetting_('student_form_connected', 'TRUE');
    writeWorkflowState_({ formConnected: true, formId });
    operationFinish_(responseSheet ? 'Student form connected. Use Prepare student choices after responses arrive.' : 'Student form connected. Google is still creating the response sheet; use Prepare student choices shortly.', responseSheet ? 'completed' : 'review');
    return { ok: true, connected: true, responseSheetReady: Boolean(responseSheet) };
  } catch (error) {
    operationFinish_(error instanceof Error ? error.message : String(error), 'failed');
    throw error;
  }
}
function refreshCodedChoicesFromResponses() {
  operationStart_('Prepare student choices','Rebuilding student identities and reading Form responses');
  const ss=SpreadsheetApp.getActive();
  try {
    const formId=getWorkbookSetting_('google_student_form_id');
    if(!formId){operationFinish_('The student form has not been created yet.','failed');return{ok:false,responseCount:0,matchedCount:0,issueCount:1};}
    normalizeFormResponseSheet_();
    const form=FormApp.openById(formId), formResponses=form.getResponses();
    const mapResult=rebuildCanonicalStudentMapForChoices_(form,formResponses);
    const studentMap=readStudentMapForResponses_(), officialClubs=readOfficialFormClubs_();
    const result=buildCodedChoicesFromFormApiResponses_(form,formResponses,studentMap,officialClubs);
    writeResponseReview_(result.issues);
    setWorkbookSetting_('coded_choices_response_count',String(result.responseCount));
    setWorkbookSetting_('coded_choices_issue_count',String(result.issues.length));
    setWorkbookSetting_('coded_choices_parser_mode','form_item_id_v10_1_local_transaction');
    setWorkbookSetting_('coded_choices_shared_email_count',String(result.sharedEmailCount||0));
    setWorkbookSetting_('coded_choices_shared_email_response_count',String(result.sharedEmailResponseCount||0));
    setWorkbookSetting_('coded_choices_collapsed_duplicate_response_count',String(result.collapsedDuplicateResponseCount||0));
    if(result.issues.length){
      setWorkbookSetting_('coded_choices_export_valid','FALSE');setWorkbookSetting_('coded_choices_matched_count','0');
      operationFinish_(result.issues.length+' response problem(s) must be fixed. Coded Choices Export was not replaced.','review');
      return{ok:false,responseCount:result.responseCount,matchedCount:0,issueCount:result.issues.length,mapResult:mapResult};
    }
    writeCodedChoicesExport_(result.headers,result.rows);
    setWorkbookSetting_('coded_choices_last_refresh',new Date().toISOString());setWorkbookSetting_('coded_choices_matched_count',String(result.rows.length));setWorkbookSetting_('coded_choices_club_column_count',String(Math.max(0,result.headers.length-5)));setWorkbookSetting_('coded_choices_last_question_map',JSON.stringify(result.questionMapSummary));setWorkbookSetting_('coded_choices_export_valid','TRUE');
    operationFinish_(result.rows.length+' unique Form student(s) prepared','completed');
    return{ok:true,responseCount:result.responseCount,matchedCount:result.rows.length,issueCount:0,mapResult:mapResult};
  }catch(error){operationFinish_(error instanceof Error?error.message:String(error),'failed');throw error;}
}

function onStudentFormSubmit_(event) {
  try {
    refreshCodedChoicesFromResponses();
  } catch (error) {
    console.error(error);
  }
}

function ensureFormSubmitTrigger_() {
  const ss=SpreadsheetApp.getActive();
  const found=ScriptApp.getProjectTriggers().some(trigger=>trigger.getHandlerFunction()==='onStudentFormSubmit_'&&trigger.getTriggerSourceId()===ss.getId());
  if(!found) ScriptApp.newTrigger('onStudentFormSubmit_').forSpreadsheet(ss).onFormSubmit().create();
}

function normalizeFormResponseSheet_() {
  const ss = SpreadsheetApp.getActive();
  const linked = findFormResponseSheet_();
  if (!linked) return null;
  const canonical = ss.getSheetByName('Form Responses');
  if (canonical && canonical.getSheetId() !== linked.getSheetId()) {
    const canDelete = isPlaceholderResponseSheet_(canonical) || normalize_(canonical.getName()) === 'form responses';
    if (canDelete) ss.deleteSheet(canonical);
  }
  const currentCanonical = ss.getSheetByName('Form Responses');
  if (linked.getName() !== 'Form Responses' && (!currentCanonical || currentCanonical.getSheetId() === linked.getSheetId())) linked.setName('Form Responses');
  setWorkbookSetting_('form_response_sheet_name', linked.getName());
  setWorkbookSetting_('form_response_sheet_id', String(linked.getSheetId()));
  return linked;
}

function findFormResponseSheet_() {
  const ss = SpreadsheetApp.getActive();
  const savedId = getWorkbookSetting_('form_response_sheet_id');
  if (savedId) {
    const byId = ss.getSheets().find(sheet => String(sheet.getSheetId()) === String(savedId));
    if (byId) return byId;
  }
  const saved = getWorkbookSetting_('form_response_sheet_name');
  if (saved) {
    const savedSheet = ss.getSheetByName(saved);
    if (savedSheet && !isPlaceholderResponseSheet_(savedSheet)) return savedSheet;
  }
  const candidates = ss.getSheets().filter(sheet => !isPlaceholderResponseSheet_(sheet)).filter(sheet => looksLikeResponseSheet_(sheet) || normalize_(sheet.getName()).startsWith('form responses')).sort((left, right) => responseSheetScore_(right) - responseSheetScore_(left));
  return candidates[0] || null;
}

function looksLikeResponseSheet_(sheet) {
  if (sheet.getFormUrl && sheet.getFormUrl()) return true;
  if (sheet.getLastRow() < 1) return false;
  const headers = sheet.getRange(1,1,1,Math.max(1,sheet.getLastColumn())).getDisplayValues()[0].map(normalize_);
  return headers.includes('timestamp') && (headers.includes('email address') || headers.some(h => fixedQuestionTitleMatches_(h, ['what is your full name?','student name','what is your name?','name'])));
}

function isPlaceholderResponseSheet_(sheet) {
  if(sheet.getLastRow()>1)return false;
  const value=normalize_(sheet.getRange(1,1).getDisplayValue());
  return !value||value.includes('raw google form responses');
}

function readStudentMapForResponses_() {
  const sheet = requiredSheet_(SpreadsheetApp.getActive(), RM.sheets.studentMap);
  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0] || []);
  const codeI = findHeader_(headers, RM.aliases.studentCode);
  const nameI = findHeader_(headers, RM.aliases.studentName);
  const gradeI = findHeader_(headers, RM.aliases.grade);
  const homeI = findHeader_(headers, RM.aliases.homeroom);
  const homeCodeI = headers.indexOf('homeroom code');
  const emailI = headers.indexOf('student email');
  const students = [];

  values.slice(1).forEach((row, index) => {
    const code = codeI >= 0 ? String(row[codeI] || '').trim() : '';
    if (!code) return;
    students.push({
      code,
      name: nameI >= 0 ? String(row[nameI] || '').trim() : '',
      grade: gradeI >= 0 ? String(row[gradeI] || '').trim() : '',
      homeroom: homeI >= 0 ? String(row[homeI] || '').trim() : '',
      homeroomCode: homeCodeI >= 0 ? String(row[homeCodeI] || '').trim() : '',
      email: emailI >= 0 ? normalize_(row[emailI]) : '',
      sheetRow: index + 2,
    });
  });

  return students;
}

function readOfficialFormClubs_() {
  const clubs = readClubReference_(SpreadsheetApp.getActive());
  return [...clubs.values()].map(club => ({
    title: club.title,
    section: club.section,
    display: club.section ? club.title + ' (' + club.section + ')' : club.title
  }));
}

function buildCodedChoicesFromFormRows_(values, students, clubs) {
  if (values.length < 1) return { headers: baseCodedChoiceHeaders_(clubs), rows: [], issues: [], responseCount: 0 };

  const rawHeaders = values[0].map(value => String(value || '').trim());
  const normalizedHeaders = rawHeaders.map(normalize_);
  const emailI = findResponseHeader_(normalizedHeaders, ['email address','email']);
  const nameI = findResponseHeader_(normalizedHeaders, ['what is your full name?','full name','student name','what is your name?','name']);
  const gradeI = findResponseHeader_(normalizedHeaders, ['what grade are you in?','grade']);
  const homeroomI = findResponseHeader_(normalizedHeaders, ['who is your homeroom teacher?','homeroom teacher','who is your teacher?','teacher','homeroom']);
  const timestampI = findResponseHeader_(normalizedHeaders, ['timestamp']);

  const sectionGroups = buildGradeSectionGroups_(rawHeaders, normalizedHeaders);
  const derivedClubs = deriveClubsFromSectionGroups_(sectionGroups);
  const outputClubs = clubs && clubs.length ? clubs : derivedClubs;
  const schemaIssues = [];

  if (nameI < 0) schemaIssues.push([1,'','','The form response sheet is missing the full-name question.','Expected: What is your full name?']);
  if (gradeI < 0) schemaIssues.push([1,'','','The form response sheet is missing the grade question.','Expected: What grade are you in?']);
  if (homeroomI < 0) schemaIssues.push([1,'','','The form response sheet is missing the homeroom question.','Expected: Who is your homeroom teacher?']);
  if (sectionGroups.length === 0) schemaIssues.push([1,'','','No grade-specific club sections were detected in the response sheet.','Regenerate the student form or restore the generated question titles.']);

  const byEmail = new Map();
  const byIdentity = new Map();
  students.forEach(student => {
    if (student.email) byEmail.set(student.email, student);
    const key = responseIdentityKey_(student.name, student.grade, student.homeroom);
    const list = byIdentity.get(key) || [];
    list.push(student);
    byIdentity.set(key, list);
  });

  const latest = new Map();
  const issues = schemaIssues.slice();

  values.slice(1).forEach((row, index) => {
    if (!row.some(cell => String(cell || '').trim())) return;

    const sheetRow = index + 2;
    const email = emailI >= 0 ? normalize_(row[emailI]) : '';
    const name = nameI >= 0 ? String(row[nameI] || '').trim() : '';
    const grade = gradeI >= 0 ? String(row[gradeI] || '').trim() : '';
    const homeroom = homeroomI >= 0 ? String(row[homeroomI] || '').trim() : '';
    let student = email ? byEmail.get(email) : null;

    if (!student) {
      const matches = byIdentity.get(responseIdentityKey_(name, grade, homeroom)) || [];
      if (matches.length === 1) student = matches[0];
      else if (matches.length > 1) {
        issues.push([sheetRow,name,email,'Multiple existing students match this response.','Review Student Map and correct the duplicate identity records.']);
        return;
      }
    }

    if (!student) {
      if (!name || !grade || !homeroom) {
        issues.push([sheetRow,name,email,'Required student identity information is missing.','Add full name, grade, and homeroom to the response.']);
        return;
      }
      student = createStudentIdentityFromResponse_({ name, email, grade, homeroom });
      students.push(student);
      if (student.email) byEmail.set(student.email, student);
      byIdentity.set(responseIdentityKey_(student.name, student.grade, student.homeroom), [student]);
    } else {
      student = synchronizeReturningStudentIdentity_(student, { name, email, grade, homeroom });
    }

    const stamp = timestampI >= 0 ? new Date(row[timestampI]).getTime() : sheetRow;
    const existing = latest.get(student.code);
    if (!existing || !Number.isFinite(existing.stamp) || stamp >= existing.stamp) {
      latest.set(student.code, { student, row, sheetRow, stamp: Number.isFinite(stamp) ? stamp : sheetRow });
    }
  });

  const rows = [];
  latest.forEach(item => {
    const gradeGroup = gradeSectionGroupFor_(item.student.grade, sectionGroups);
    const maxClubs = gradeGroup && gradeGroup.maxIndex >= 0 ? normalizeMaxClubAnswer_(item.row[gradeGroup.maxIndex]) : '';
    const topChoice = gradeGroup && gradeGroup.topIndex >= 0 ? canonicalClubChoice_(item.row[gradeGroup.topIndex] || '', outputClubs) : '';
    const ratingsByClub = new Map();

    if (gradeGroup) {
      gradeGroup.clubQuestions.forEach(question => {
        const raw = String(item.row[question.index] || '').trim();
        if (!raw) return;
        const normalizedAnswer = normalizeInterestResponse_(raw);
        bilingualClubAliases_(question.display).forEach(key => {
          const list = ratingsByClub.get(key) || [];
          list.push(normalizedAnswer);
          ratingsByClub.set(key, list);
        });
      });
    } else {
      issues.push([item.sheetRow,item.student.name,item.student.email || '','No grade-specific club section matched grade ' + item.student.grade + '.', 'Check that the grade question and branching sections were generated correctly.']);
    }

    const output = [item.student.code, item.student.grade, homeroomCodeFor_(item.student.homeroom), maxClubs, topChoice];

    outputClubs.forEach(club => {
      const keys = clubResponseKeys_(club);
      let answers = [];
      keys.forEach(key => {
        if (!answers.length && ratingsByClub.has(key)) answers = ratingsByClub.get(key) || [];
      });
      const distinctAnswers = [...new Set(answers)];
      if (distinctAnswers.length > 1) {
        issues.push([item.sheetRow,item.student.name,item.student.email || '','More than one rating was found for ' + club.display + ': ' + distinctAnswers.join(', '),'Keep one generated rating question for this club in the student grade section.']);
      }
      output.push(distinctAnswers.length ? strongestInterestResponse_(distinctAnswers) : 'No thanks');
    });

    if (!maxClubs) issues.push([item.sheetRow,item.student.name,item.student.email || '','The number of clubs requested is missing.','Ask the student to answer how many clubs they would like to join.']);
    if (!topChoice) issues.push([item.sheetRow,item.student.name,item.student.email || '','The top-choice club is missing.','Ask the student to answer which club they want most.']);

    rows.push(output);
  });

  rows.sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return { headers: baseCodedChoiceHeaders_(outputClubs), rows, issues, responseCount: Math.max(0, values.length - 1) };
}

function responseSheetScore_(sheet) {
  let score = 0;
  const name = normalize_(sheet.getName());
  if (name === 'form responses') score += 10;
  if (name.startsWith('form responses')) score += 5;
  if (sheet.getLastRow() > 1) score += 100 + sheet.getLastRow();
  if (sheet.getFormUrl && sheet.getFormUrl()) score += 1000;
  return score;
}

function normalizedClubHeaderCandidates_(club) {
  const display = String(club.display || '').trim(); const title = String(club.title || '').trim(); const section = String(club.section || '').trim();
  const names = [display, title]; if (section) { names.push(title + ' (' + section + ')'); names.push(title + ' - ' + section); }
  const out = []; names.filter(Boolean).forEach(name => { out.push(normalize_(name)); out.push(normalize_('How interested are you in ' + name + '?')); out.push(normalize_('How interested are you in ' + name)); });
  return [...new Set(out)].filter(Boolean);
}

function findMatchingResponseColumns_(headers, club) {
  const candidates = new Set(normalizedClubHeaderCandidates_(club));
  const indexes = [];

  headers.forEach((header, index) => {
    if (candidates.has(header)) indexes.push(index);
  });

  return indexes;
}

function strongestInterestResponse_(answers) {
  const scores = { 'No thanks': 0, 'Maybe': 1, 'Definitely': 2 };
  return answers.reduce((best, answer) => {
    return (scores[answer] || 0) > (scores[best] || 0) ? answer : best;
  }, 'No thanks');
}

function baseCodedChoiceHeaders_(clubs){return['student_code','grade','homeroom_code','max_clubs','top_choice'].concat(clubs.map(club=>club.display));}
function findResponseHeader_(headers,aliases){for(const alias of aliases){const normalizedAlias=normalize_(alias);const i=headers.findIndex(header=>header===normalizedAlias||header.startsWith(normalizedAlias+' /'));if(i>=0)return i;}return-1;}
function createStudentIdentityFromResponse_({ name, email, grade, homeroom }) {
  const student = {
    code: generateStudentCode_(),
    name: String(name || '').trim(),
    email: normalize_(email),
    grade: String(grade || '').trim(),
    homeroom: String(homeroom || '').trim(),
    homeroomCode: homeroomCodeFor_(homeroom),
    sheetRow: 0,
  };

  appendOrUpdateStudentMapRow_(SpreadsheetApp.getActive(), student);
  const yearWorkbookId = getWorkbookSetting_('google_year_setup_workbook_id');

  if (yearWorkbookId) {
    try {
      appendOrUpdateStudentMapRow_(SpreadsheetApp.openById(yearWorkbookId), student);
    } catch (error) {
      console.error('Could not synchronize new student to year Student Map', error);
    }
  }

  return student;
}

function synchronizeReturningStudentIdentity_(student, response) {
  const updated = {
    ...student,
    name: String(response.name || student.name || '').trim(),
    email: normalize_(response.email || student.email || ''),
    grade: String(response.grade || student.grade || '').trim(),
    homeroom: String(response.homeroom || student.homeroom || '').trim(),
    homeroomCode: homeroomCodeFor_(response.homeroom || student.homeroom || ''),
  };

  appendOrUpdateStudentMapRow_(SpreadsheetApp.getActive(), updated);
  const yearWorkbookId = getWorkbookSetting_('google_year_setup_workbook_id');

  if (yearWorkbookId) {
    try {
      appendOrUpdateStudentMapRow_(SpreadsheetApp.openById(yearWorkbookId), updated);
    } catch (error) {
      console.error('Could not synchronize returning student to year Student Map', error);
    }
  }

  return updated;
}

function appendOrUpdateStudentMapRow_(spreadsheet, student) {
  const sheet = spreadsheet.getSheetByName(RM.sheets.studentMap);
  if (!sheet) throw new Error('Missing Student Map in ' + spreadsheet.getName() + '.');

  const values = sheet.getDataRange().getDisplayValues();
  const headers = headerMap_(values[0] || []);
  const codeI = findHeader_(headers, RM.aliases.studentCode);
  const nameI = findHeader_(headers, RM.aliases.studentName);
  const emailI = headers.indexOf('student email');
  const gradeI = findHeader_(headers, RM.aliases.grade);
  const homeCodeI = headers.indexOf('homeroom code');
  const homeI = findHeader_(headers, RM.aliases.homeroom);
  const activeI = headers.indexOf('active');
  const firstI = headers.indexOf('first seen block');
  const lastI = headers.indexOf('last seen block');

  if (codeI < 0 || nameI < 0) throw new Error('Student Map is missing required headers.');

  let rowNumber = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][codeI] || '').trim() === student.code) {
      rowNumber = index + 1;
      break;
    }
  }

  if (!rowNumber) rowNumber = Math.max(2, sheet.getLastRow() + 1);
  const width = Math.max(sheet.getLastColumn(), values[0] ? values[0].length : 9);
  const row = rowNumber <= values.length ? (values[rowNumber - 1] || []).slice() : [];
  while (row.length < width) row.push('');

  row[codeI] = student.code;
  row[nameI] = student.name;
  if (emailI >= 0) row[emailI] = student.email;
  if (gradeI >= 0) row[gradeI] = student.grade;
  if (homeCodeI >= 0) row[homeCodeI] = student.homeroomCode;
  if (homeI >= 0) row[homeI] = student.homeroom;
  if (activeI >= 0) row[activeI] = 'TRUE';
  if (firstI >= 0 && !row[firstI]) row[firstI] = getWorkbookSetting_('block_label') || 'form response';
  if (lastI >= 0) row[lastI] = getWorkbookSetting_('block_label') || 'form response';

  sheet.getRange(rowNumber, 1, 1, width).setValues([row]);
}

function generateStudentCode_() {
  const existing = new Set();
  const sheet = SpreadsheetApp.getActive().getSheetByName(RM.sheets.studentMap);
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getDataRange().getDisplayValues();
    const headers = headerMap_(values[0] || []);
    const codeI = findHeader_(headers, RM.aliases.studentCode);
    if (codeI >= 0) values.slice(1).forEach(row => existing.add(String(row[codeI] || '').trim()));
  }

  let code = '';
  do {
    code = 'STU-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  } while (existing.has(code));

  return code;
}




function buildClubQuestionIndex_(headers, clubs) {
  const result = new Map();
  clubs.forEach(club => result.set(club.display, []));
  const aliases = new Map();
  clubs.forEach(club => normalizedClubHeaderCandidates_(club).forEach(alias => aliases.set(alias, club.display)));
  headers.forEach((header, index) => {
    const normalized = normalize_(header);
    if (normalized.includes('which one would you want most') || normalized.includes('how many clubs') || normalized.includes('grade') || normalized.includes('homeroom') || normalized.includes('name') || normalized.includes('email') || normalized.includes('timestamp')) return;
    let clubDisplay = aliases.get(normalized);
    if (!clubDisplay) {
      const match = normalized.match(/^how interested are you in (.+)\??$/);
      if (match) clubDisplay = aliases.get(normalize_(match[1])) || aliases.get(normalize_(match[1].replace(/\?$/, '')));
    }
    if (!clubDisplay) {
      for (const [alias, display] of aliases.entries()) {
        if (alias && normalized.includes(alias)) { clubDisplay = display; break; }
      }
    }
    if (clubDisplay) { const list = result.get(clubDisplay) || []; list.push(index); result.set(clubDisplay, list); }
  });
  return result;
}


function findAllResponseHeaders_(headers, aliases) {
  const normalizedAliases = aliases.map(normalize_);
  const indexes = [];
  headers.forEach((header, index) => {
    if (normalizedAliases.includes(header)) indexes.push(index);
  });
  return indexes;
}
function firstNonBlankFromIndexes_(row, indexes, transform) {
  for (const index of indexes) {
    const raw = row[index];
    const value = transform ? transform(raw) : String(raw || '').trim();
    if (String(value || '').trim()) return String(value).trim();
  }
  return '';
}
function normalizeMaxClubAnswer_(value) {
  const match = String(value || '').match(/[0-9]+/);
  return match ? match[0] : '';
}
function deriveFormClubsFromResponseHeaders_(headers) {
  const seen = new Set();
  const clubs = [];
  headers.map(String).forEach(header => {
    const match = header.trim().match(/^How interested are you in (.+)\?$/i);
    if (!match) return;
    const display = match[1].trim();
    const key = normalize_(display);
    if (!display || seen.has(key)) return;
    seen.add(key);
    const parsed = parseDisplayClubName_(display);
    clubs.push({ title: parsed.title, section: parsed.section, display });
  });
  return clubs;
}
function parseDisplayClubName_(display) {
  const match = String(display || '').trim().match(/^(.*) \((.*)\)$/);
  if (match) return { title: match[1].trim(), section: match[2].trim() };
  return { title: String(display || '').trim(), section: '' };
}


function fixedQuestionTitleMatches_(value, aliases) {
  const normalized = normalize_(value);
  return aliases.some(alias => {
    const normalizedAlias = normalize_(alias);
    return normalized === normalizedAlias || normalized.startsWith(normalizedAlias + ' /');
  });
}
function bilingualClubAliases_(value) {
  const text = String(value || '').trim();
  const pieces = text.split(/\s+\/\s+/);
  return unique_([normalize_(text), normalize_(pieces[0] || '')]);
}
function canonicalClubChoice_(value, clubs) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const submittedAliases = new Set(bilingualClubAliases_(raw));
  for (const club of clubs || []) {
    const candidates = unique_(clubResponseKeys_(club).concat(bilingualClubAliases_(club.display)));
    if (candidates.some(candidate => submittedAliases.has(candidate))) return club.display;
  }
  return String(raw.split(/\s+\/\s+/)[0] || raw).trim();
}

function buildGradeSectionGroups_(rawHeaders, normalizedHeaders) {
  const groups = [];
  let current = null;
  rawHeaders.forEach((header, index) => {
    const normalized = normalizedHeaders[index];
    const clubDisplay = clubDisplayFromRatingHeader_(header);
    if (clubDisplay) {
      if (!current) current = { clubQuestions: [], maxIndex: -1, topIndex: -1 };
      current.clubQuestions.push({ index, display: clubDisplay });
      return;
    }
    if (fixedQuestionTitleMatches_(normalized, ['how many clubs would you like to join?','how many clubs would you like?','max clubs'])) {
      if (!current) current = { clubQuestions: [], maxIndex: -1, topIndex: -1 };
      current.maxIndex = index;
      return;
    }
    if (fixedQuestionTitleMatches_(normalized, ['if you could only get one club, which one would you want most?','what is your top choice?','top choice'])) {
      if (!current) current = { clubQuestions: [], maxIndex: -1, topIndex: -1 };
      current.topIndex = index;
      groups.push(current);
      current = null;
    }
  });
  if (current && current.clubQuestions.length) groups.push(current);
  return groups;
}
function gradeSectionGroupFor_(grade, groups) {
  if (!groups.length) return null;
  const value = String(grade || '').match(/[0-9]+/);
  const gradeNumber = value ? Number(value[0]) : NaN;
  const index = Number.isFinite(gradeNumber) ? gradeNumber - 3 : 0;
  if (index >= 0 && index < groups.length) return groups[index];
  return groups[0];
}
function clubDisplayFromRatingHeader_(header) {
  const match = String(header || '').trim().match(/^How interested are you in (.+)\?$/i);
  return match ? match[1].trim() : '';
}
function deriveClubsFromSectionGroups_(groups) {
  const seen = new Set();
  const clubs = [];
  groups.forEach(group => {
    group.clubQuestions.forEach(question => {
      const key = normalize_(question.display);
      if (!question.display || seen.has(key)) return;
      seen.add(key);
      const parsed = parseDisplayClubName_(question.display);
      clubs.push({ title: parsed.title, section: parsed.section, display: question.display });
    });
  });
  return clubs;
}
function parseDisplayClubName_(display) {
  const match = String(display || '').trim().match(/^(.*) \((.*)\)$/);
  if (match) return { title: match[1].trim(), section: match[2].trim() };
  return { title: String(display || '').trim(), section: '' };
}
function clubResponseKeys_(club) {
  return unique_([
    club.display,
    club.title,
    club.section ? club.title + ' (' + club.section + ')' : '',
    club.section ? club.title + ' - ' + club.section : ''
  ].map(normalize_));
}
function normalizeMaxClubAnswer_(value) {
  const match = String(value || '').match(/[0-9]+/);
  return match ? match[0] : '';
}


function buildFormQuestionMapFromItems_(form) {
  const map = {
    nameItemId: '',
    gradeItemId: '',
    homeroomItemId: '',
    clubItems: [],
    maxItemsByGrade: {},
    topItemsByGrade: {},
  };

  let currentGrade = '';
  let inferredGradeIndex = 0;
  const gradeSequence = ['3', '4', '5'];

  form.getItems().forEach(item => {
    const type = item.getType ? String(item.getType()) : '';
    const title = String(item.getTitle ? item.getTitle() : '').trim();
    const normalized = normalize_(title);

    if (type === 'PAGE_BREAK' || type === String(FormApp.ItemType.PAGE_BREAK)) {
      const parsedGrade = gradeFromText_(title);
      if (parsedGrade) currentGrade = parsedGrade;
      else if (title && inferredGradeIndex < gradeSequence.length && normalize_(title).includes('club')) currentGrade = gradeSequence[inferredGradeIndex++];
      return;
    }

    if (!map.nameItemId && fixedQuestionTitleMatches_(normalized, ['what is your full name?','full name','student name','what is your name?','name'])) {
      map.nameItemId = String(item.getId());
      return;
    }

    if (!map.gradeItemId && fixedQuestionTitleMatches_(normalized, ['what grade are you in?','grade'])) {
      map.gradeItemId = String(item.getId());
      return;
    }

    if (!map.homeroomItemId && fixedQuestionTitleMatches_(normalized, ['who is your homeroom teacher?','homeroom teacher','who is your teacher?','teacher','homeroom'])) {
      map.homeroomItemId = String(item.getId());
      return;
    }

    const clubDisplay = clubDisplayFromRatingHeader_(title);
    if (clubDisplay) {
      map.clubItems.push({ itemId: String(item.getId()), grade: currentGrade, display: clubDisplay });
      return;
    }

    if (fixedQuestionTitleMatches_(normalized, ['how many clubs would you like to join?','how many clubs would you like?','max clubs'])) {
      map.maxItemsByGrade[currentGrade || ''] = String(item.getId());
      return;
    }

    if (fixedQuestionTitleMatches_(normalized, ['if you could only get one club, which one would you want most?','what is your top choice?','top choice'])) {
      map.topItemsByGrade[currentGrade || ''] = String(item.getId());
    }
  });

  return map;
}

function answersByItemId_(formResponse) {
  const answers = new Map();
  formResponse.getItemResponses().forEach(itemResponse => {
    const item = itemResponse.getItem();
    const response = itemResponse.getResponse();
    answers.set(String(item.getId()), Array.isArray(response) ? response.join(', ') : String(response || '').trim());
  });
  return answers;
}

function safeGetRespondentEmail_(formResponse) {
  try {
    return formResponse.getRespondentEmail ? String(formResponse.getRespondentEmail() || '') : '';
  } catch (error) {
    return '';
  }
}

function itemIdForGrade_(map, grade) {
  if (map[String(grade)]) return map[String(grade)];
  if (map['']) return map[''];
  const keys = Object.keys(map);
  return keys.length ? map[keys[0]] : '';
}

function gradeFromText_(text) {
  const value = String(text || '').match(/(?:grade\s*|\b)(3|4|5)(?:\b|st|nd|rd|th)/i);
  return value ? value[1] : '';
}

function clubDisplayFromRatingHeader_(header) {
  const match = String(header || '').trim().match(/^How interested are you in (.+)\?$/i);
  return match ? match[1].trim() : '';
}

function uniqueClubsFromQuestionMap_(questionMap) {
  const seen = new Set();
  const clubs = [];
  questionMap.clubItems.forEach(item => {
    const key = normalize_(item.display);
    if (!item.display || seen.has(key)) return;
    seen.add(key);
    const parsed = parseDisplayClubName_(item.display);
    clubs.push({ title: parsed.title, section: parsed.section, display: item.display });
  });
  return clubs;
}

function parseDisplayClubName_(display) {
  const match = String(display || '').trim().match(/^(.*) \((.*)\)$/);
  if (match) return { title: match[1].trim(), section: match[2].trim() };
  return { title: String(display || '').trim(), section: '' };
}

function clubResponseKeys_(club) {
  return unique_([
    club.display,
    club.title,
    club.section ? club.title + ' (' + club.section + ')' : '',
    club.section ? club.title + ' - ' + club.section : ''
  ].map(normalize_));
}

function normalizeMaxClubAnswer_(value) {
  const match = String(value || '').match(/[0-9]+/);
  return match ? match[0] : '';
}

function responseIdentityKey_(name,grade,homeroom){return[normalize_(name),normalize_(grade),normalize_(homeroom)].join('|');}
function homeroomCodeFor_(homeroomName){const sheet=SpreadsheetApp.getActive().getSheetByName('Homerooms');if(!sheet)return homeroomName;const values=sheet.getDataRange().getDisplayValues();for(let i=1;i<values.length;i++){if(normalize_(values[i][1])===normalize_(homeroomName))return String(values[i][0]||homeroomName).trim();}return homeroomName;}
function normalizeInterestResponse_(value){
  const n=normalize_(value);
  const english=normalize_(String(value||'').split(/\s+\/\s+/)[0]);
  if(['i really want this club','really want','really wants this','definitely','2'].includes(n)||['i really want this club','really want','really wants this','definitely','2'].includes(english))return'Definitely';
  if(['i might like this club','might like','maybe','would try','would try this','1'].includes(n)||['i might like this club','might like','maybe','would try','would try this','1'].includes(english))return'Maybe';
  if(['no thanks','no','0'].includes(n)||['no thanks','no','0'].includes(english))return'No thanks';
  return'No thanks';
}

function writeCodedChoicesExport_(headers,rows){const sheet=ensureSheet_(SpreadsheetApp.getActive(),RM.sheets.codedChoices,[headers]);sheet.clearContents();sheet.getRange(1,1,Math.max(1,rows.length+1),headers.length).setValues([headers].concat(rows));formatHeader_(sheet,headers.length);const filter=sheet.getFilter();if(filter)filter.remove();if(rows.length)sheet.getRange(1,1,rows.length+1,headers.length).createFilter();}
function writeResponseReview_(issues){const sheet=ensureSheet_(SpreadsheetApp.getActive(),'Response Problems',[['response_row','student_name','email','problem','suggested_fix']]);const rows=[['response_row','student_name','email','problem','suggested_fix']].concat(issues);sheet.clearContents();sheet.getRange(1,1,rows.length,5).setValues(rows);formatHeader_(sheet,5);}

function getWorkbookSettingsMap_(){
  const sheet=SpreadsheetApp.getActive().getSheetByName('Settings');
  const map=new Map();
  if(!sheet)return map;
  const values=sheet.getDataRange().getDisplayValues();
  for(let i=1;i<values.length;i++){
    const key=normalize_(values[i][0]);
    if(key)map.set(key,String(values[i][1]||'').trim());
  }
  return map;
}
function getWorkbookSetting_(key){return getWorkbookSettingsMap_().get(normalize_(key))||'';}
function setWorkbookSetting_(key,value){const sheet=ensureSheet_(SpreadsheetApp.getActive(),'Settings',[['setting','value']]);const values=sheet.getDataRange().getValues();for(let i=1;i<values.length;i++){if(normalize_(values[i][0])===normalize_(key)){sheet.getRange(i+1,2).setValue(value);return;}}sheet.appendRow([key,value]);}




function parseEditorStudentCode_(value) {
  const text = String(value || '').trim();
  if (!text || normalize_(text) === 'none') return '';
  const parts = text.split('|').map(part => part.trim()).filter(Boolean);
  const candidate = parts.length ? parts[parts.length - 1] : '';
  return /^STU[-_A-Z0-9]+$/i.test(candidate) ? candidate : '';
}

function editorClubColumns_(sheet) {
  const result = [];
  const lastColumn = sheet.getLastColumn();
  for (let col = 1; col <= lastColumn; col += 3) {
    const title = String(sheet.getRange(5, col).getDisplayValue() || '').trim();
    if (title) result.push({ col, title });
  }
  return result;
}

function parseEditedRosterAssignments_() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Edit Draft Rosters');
  if (!sheet) throw new Error('Edit Draft Rosters has not been built yet.');
  const students = readStudents_(ss);
  const clubs = readClubReference_(ss);
  const assignments = [];
  const problems = [];
  const seen = new Set();
  const blocks = editorClubColumns_(sheet);
  blocks.forEach(block => {
    const parsed = parseDisplayClubName_(block.title);
    const clubKeyValue = clubKey_(parsed.title, parsed.section);
    const club = clubs.get(clubKeyValue) || basicClub_(parsed.title, parsed.section);
    let waitlistRow = sheet.getLastRow() + 1;
    for (let row = 9; row <= sheet.getLastRow(); row += 1) {
      const label = normalize_(sheet.getRange(row, block.col).getDisplayValue());
      if (label.startsWith('waitlist')) { waitlistRow = row; break; }
    }
    for (let row = 9; row < waitlistRow; row += 1) {
      const card = sheet.getRange(row, block.col + 1).getDisplayValue();
      if (!String(card || '').trim()) continue;
      const code = parseEditorStudentCode_(card);
      if (!code) {
        problems.push(['Blocking','',block.title,row,'Student card is not recognized.','Cut and paste the complete student-card cell.',{type:'malformed',club:block.title,row,col:block.col + 1}]);
        continue;
      }
      const student = students.get(code);
      if (!student) {
        problems.push(['Blocking',code,block.title,row,'Student code was not found in Student Map.','Restore the original student card.',{type:'unknown_student',club:block.title,row,col:block.col + 1}]);
        continue;
      }
      const duplicateKey = code + '|' + clubKeyValue;
      if (seen.has(duplicateKey)) {
        problems.push(['Blocking',student.name,block.title,row,'Student appears twice in this club.','Remove the duplicate card.',{type:'duplicate',club:block.title,row,col:block.col + 1,studentCode:code}]);
        continue;
      }
      seen.add(duplicateKey);
      if (club.gradeLimited && club.eligibleGrades.length && !club.eligibleGrades.includes(String(student.grade))) {
        problems.push(['Blocking',student.name,block.title,row,'Student is not grade eligible for this club.','Move the student to an eligible club.',{type:'grade',club:block.title,row,col:block.col + 1,studentCode:code}]);
      }
      assignments.push({
        studentCode:code,
        studentName:student.name,
        grade:student.grade,
        homeroom:student.homeroom,
        clubTitle:parsed.title,
        sectionLabel:parsed.section,
        displayClub:block.title,
        rowNumber:row,
        editorCol:block.col + 1,
        meetingDays:club.meetingDays || [],
        maxCapacity:club.maxCapacity || 0,
        capacityType:club.capacityType || '',
        clubKey:clubKeyValue
      });
    }
  });
  const byStudent = new Map();
  assignments.forEach(a => { const list = byStudent.get(a.studentCode) || []; list.push(a); byStudent.set(a.studentCode,list); });
  byStudent.forEach(items => {
    for (let i=0;i<items.length;i += 1) for (let j=i+1;j<items.length;j += 1) {
      const sharedDays = items[i].meetingDays.filter(day => items[j].meetingDays.includes(day));
      if (sharedDays.length) {
        problems.push(['Blocking',items[i].studentName,items[i].displayClub + ' / ' + items[j].displayClub,'','Meeting-day conflict.','Remove or move one conflicting assignment.',{
          type:'conflict',
          studentCode:items[i].studentCode,
          first:{club:items[i].displayClub,row:items[i].rowNumber,col:items[i].editorCol,otherClub:items[j].displayClub},
          second:{club:items[j].displayClub,row:items[j].rowNumber,col:items[j].editorCol,otherClub:items[i].displayClub},
          sharedDays
        }]);
      }
    }
  });
  const byClub = new Map();
  assignments.forEach(a => { const list = byClub.get(a.clubKey) || []; list.push(a); byClub.set(a.clubKey,list); });
  clubs.forEach(club => {
    if (club.capacityType !== 'limited' || !club.maxCapacity || club.maxCapacity <= 0) return;
    const count = (byClub.get(club.key) || []).length;
    if (count > club.maxCapacity) {
      problems.push(['Advisory','',displayClub_(club.title, club.section),'','Club is above capacity by manual override.','Confirm this capacity override is intentional.']);
    }
  });
  return { assignments, problems, students, clubs };
}

function writeRosterProblems_(problems) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ensureSheet_(ss,'Roster Problems',[['severity','student','club','editor_row','problem','suggested_fix']]);
  const visibleProblems = problems.map(problem => [
    problem[0] || '',
    problem[1] || '',
    problem[2] || '',
    problem[3] || '',
    problem[4] || '',
    problem[5] || ''
  ]);
  const rows = [['severity','student','club','editor_row','problem','suggested_fix']].concat(visibleProblems);
  sheet.clear();
  sheet.getRange(1,1,rows.length,6).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,6).setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold');
  sheet.autoResizeColumns(1,6);
  if (problems.length) sheet.showSheet(); else if (!sheet.isSheetHidden()) sheet.hideSheet();
}

function writeFinalRostersFromEditor_(assignments) {
  const ss = SpreadsheetApp.getActive();
  const finalSheet = ensureSheet_(ss,'Final Rosters',[['club','student','grade','homeroom','student_code']]);
  const sorted = assignments.slice().sort((a,b) => displayClub_(a.clubTitle,a.sectionLabel).localeCompare(displayClub_(b.clubTitle,b.sectionLabel)) || a.studentName.localeCompare(b.studentName));
  const namedRows = [['club','student','grade','homeroom','student_code']].concat(sorted.map(a => [displayClub_(a.clubTitle,a.sectionLabel),a.studentName,a.grade,a.homeroom,a.studentCode]));
  finalSheet.clear();
  finalSheet.getRange(1,1,namedRows.length,5).setValues(namedRows);
  finalSheet.setFrozenRows(1);
  finalSheet.getRange(1,1,1,5).setBackground(RM.colors.navy).setFontColor('white').setFontWeight('bold');
  finalSheet.autoResizeColumns(1,5);
  finalSheet.showSheet();

  const coded = ensureSheet_(ss,RM.sheets.finalCoded,[RM.finalCodedHeaders]);
  const order = new Map();
  const codedRows = [RM.finalCodedHeaders];
  sorted.forEach(a => { const n=(order.get(a.studentCode)||0)+1; order.set(a.studentCode,n); codedRows.push([a.studentCode,a.clubTitle,a.sectionLabel,n]); });
  coded.clearContents();
  coded.getRange(1,1,codedRows.length,4).setValues(codedRows);
  formatHeader_(coded,4);
  if (!coded.isSheetHidden()) coded.hideSheet();
}

function recordEditorChanges_(assignments) {
  const changes = diffEditorChanges_(assignments);
  if (!changes.length) return 0;

  const sheet = ensureSheet_(
    SpreadsheetApp.getActive(),
    RM.sheets.changeHistory,
    [RM.historyHeaders]
  );
  const timestamp = new Date();
  const actor = Session.getActiveUser().getEmail() || 'Unknown';

  changes.forEach(change => {
    sheet.appendRow([
      timestamp,
      actor,
      change.action,
      change.studentName,
      change.code,
      change.fromClub,
      change.toClub,
      'Roster editor validation'
    ]);
  });

  return changes.length;
}

function validateEditedRostersOnce_() {
  operationStart_(
    'Validate edited rosters',
    'Reading student cards and checking roster rules'
  );

  try {
    clearEditorValidationMarkup_();
    const parsed = parseEditedRosterAssignments_();
    writeRosterProblems_(parsed.problems);
    markEditorValidationProblems_(parsed.problems);

    const blocking = parsed.problems.filter(row => row[0] === 'Blocking');
    if (blocking.length > 0) {
      operationFinish_(
        blocking.length + ' blocking roster problem' + (blocking.length === 1 ? '' : 's') + ' found',
        'review'
      );
      applyCoordinatorWorkbookLayout_();
      return {
        ok: false,
        problemCount: parsed.problems.length,
        assignmentCount: parsed.assignments.length,
        changeCount: 0
      };
    }

    writeFinalRostersFromEditor_(parsed.assignments);
    const changeCount = recordEditorChanges_(parsed.assignments);
    setWorkbookSetting_('edited_rosters_validated_at', new Date().toISOString());
    setWorkbookSetting_('edited_rosters_change_count', String(changeCount));
    markEditorValidationProblems_([]);
    operationFinish_(
      'Final rosters are ready. ' + changeCount + ' manual change' + (changeCount === 1 ? '' : 's') + ' recorded.',
      'completed'
    );
    applyCoordinatorWorkbookLayout_();

    return {
      ok: true,
      problemCount: 0,
      assignmentCount: parsed.assignments.length,
      changeCount
    };
  } catch (error) {
    operationFinish_(
      error instanceof Error ? error.message : String(error),
      'failed'
    );
    throw error;
  }
}

function openRosterProblems() { return openWorkbookSheet('Roster Problems'); }
function openFinalRosters() { return openWorkbookSheet('Final Rosters'); }


function clearEditorValidationMarkup_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Edit Draft Rosters');
  if (!sheet) return;
  const saved = getWorkbookSetting_('editor_validation_marks_v3');
  if (saved) {
    try {
      const marks = JSON.parse(saved);
      marks.forEach(mark => {
        if (!mark || !mark.a1) return;
        const range = sheet.getRange(mark.a1);
        if (mark.background) range.setBackground(mark.background);
        if (mark.fontColor) range.setFontColor(mark.fontColor);
        range.clearNote();
      });
    } catch (error) {
      console.warn('Could not restore prior editor validation marks.', error);
    }
  }
  setWorkbookSetting_('editor_validation_marks_v3', '');
  editorClubColumns_(sheet).forEach(block => {
    const header = sheet.getRange(5, block.col, 1, 2);
    header.setBackground('#E2F0D9').setFontColor('#172033').clearNote();
  });
  const banner = sheet.getRange(2, 1, 1, Math.max(1, sheet.getLastColumn()));
  banner.clearNote().setBackground('#F8FAFC').setFontColor('#475467');
}

function readEditorClubForBlock_(displayName) {
  const parsed = parseDisplayClubName_(displayName);
  return readClubReference_(SpreadsheetApp.getActive()).get(
    clubKey_(parsed.title, parsed.section)
  ) || null;
}

function markEditorValidationProblems_(problems) {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Edit Draft Rosters');
  if (!sheet) return;
  clearEditorValidationMarkup_();
  const blocks = editorClubColumns_(sheet);
  const marksByA1 = new Map();
  function queueMark_(range, color, fontColor, message) {
    const a1 = range.getA1Notation();
    if (!marksByA1.has(a1)) {
      marksByA1.set(a1, {
        a1,
        background: range.getBackground(),
        fontColor: range.getFontColor(),
        color,
        newFontColor: fontColor,
        messages: []
      });
    }
    const mark = marksByA1.get(a1);
    if (message) mark.messages.push(message);
    mark.color = color;
    mark.newFontColor = fontColor;
  }
  function matchingBlocksForClub_(clubName) {
    return blocks.filter(block => {
      if (!clubName) return false;
      return normalize_(block.title) === normalize_(clubName) ||
        normalize_(clubName).includes(normalize_(block.title)) ||
        normalize_(block.title).includes(normalize_(clubName));
    });
  }
  problems.forEach(problem => {
    const severity = String(problem[0] || 'Blocking');
    if (severity !== 'Blocking') return;
    const clubName = String(problem[2] || '').trim();
    const rowNumber = Number(problem[3] || 0);
    const message = String(problem[4] || '').trim();
    const suggestedFix = String(problem[5] || '').trim();
    const meta = problem[6] || {};
    const fullMessage = [message, suggestedFix].filter(Boolean).join('\n');
    const color = '#FCE8E6';
    const fontColor = '#8A1C1C';

    if (meta.type === 'conflict') {
      const shared = meta.sharedDays && meta.sharedDays.length ? meta.sharedDays.join(', ') : 'the same meeting day';
      [meta.first, meta.second].forEach(item => {
        if (!item) return;
        const note = 'Meeting-day conflict\n\nThis student is also assigned to:\n' + item.otherClub + '\n\nBoth clubs meet on:\n' + shared;
        matchingBlocksForClub_(item.club).forEach(block => queueMark_(sheet.getRange(5, block.col, 1, 2), color, fontColor, note));
        if (item.row >= 1 && item.row <= sheet.getMaxRows() && item.col >= 1 && item.col <= sheet.getMaxColumns()) {
          queueMark_(sheet.getRange(item.row, item.col), color, fontColor, note);
        }
      });
      return;
    }

    matchingBlocksForClub_(clubName).forEach(block => {
      queueMark_(sheet.getRange(5, block.col, 1, 2), color, fontColor, fullMessage);
      if (rowNumber >= 1 && rowNumber <= sheet.getMaxRows()) {
        queueMark_(sheet.getRange(rowNumber, block.col + 1), color, fontColor, fullMessage);
      }
    });
  });
  const savedMarks = [];
  marksByA1.forEach(mark => {
    const range = sheet.getRange(mark.a1);
    range.setBackground(mark.color).setFontColor(mark.newFontColor);
    if (mark.messages.length) range.setNote(unique_(mark.messages).join('\n\n'));
    savedMarks.push({
      a1: mark.a1,
      background: mark.background,
      fontColor: mark.fontColor
    });
  });
  setWorkbookSetting_('editor_validation_marks_v3', JSON.stringify(savedMarks));
  const blockingCount = problems.filter(row => row[0] === 'Blocking').length;
  const advisoryCount = problems.length - blockingCount;
  const summary = problems.length
    ? 'Validation found ' + blockingCount + ' blocking problem' + (blockingCount === 1 ? '' : 's') + (advisoryCount ? ' and ' + advisoryCount + ' warning' + (advisoryCount === 1 ? '' : 's') : '') + '. Correct red highlights or review Roster Problems.'
    : 'Validation passed. Final rosters are ready for Scheduler.';
  const banner = sheet.getRange(2, 1, 1, Math.max(1, sheet.getLastColumn()));
  banner
    .setBackground(blockingCount ? '#FCE8E6' : advisoryCount ? '#FFF2CC' : '#E2F0D9')
    .setFontColor(blockingCount ? '#8A1C1C' : advisoryCount ? '#7A4E00' : '#245B2A')
    .setNote(summary);
  sheet.getRange(2, 1).setValue(summary).setFontWeight('bold');
}

function diffEditorChanges_(assignments) {
  const ss = SpreadsheetApp.getActive();
  const draft = ss.getSheetByName(RM.sheets.draftNamed);
  const students = readStudents_(ss);
  const originalByStudent = new Map();
  const editedByStudent = new Map();

  if (draft && draft.getLastRow() > 1) {
    const values = draft.getDataRange().getDisplayValues();
    const headers = headerMap_(values[0]);
    const codeI = findHeader_(headers, RM.aliases.studentCode);
    const titleI = findHeader_(headers, RM.aliases.clubTitle);
    const sectionI = findHeader_(headers, RM.aliases.sectionLabel);

    if (codeI >= 0 && titleI >= 0) {
      values.slice(1).forEach(row => {
        const code = String(row[codeI] || '').trim();
        const title = String(row[titleI] || '').trim();
        const section = sectionI >= 0 ? String(row[sectionI] || '').trim() : '';
        if (!code || !title) return;
        const list = originalByStudent.get(code) || [];
        list.push(displayClub_(title, section));
        originalByStudent.set(code, list);
      });
    }
  }

  assignments.forEach(assignment => {
    const list = editedByStudent.get(assignment.studentCode) || [];
    list.push(displayClub_(assignment.clubTitle, assignment.sectionLabel));
    editedByStudent.set(assignment.studentCode, list);
  });

  const codes = new Set([
    ...originalByStudent.keys(),
    ...editedByStudent.keys()
  ]);
  const changes = [];

  codes.forEach(code => {
    const before = (originalByStudent.get(code) || []).slice().sort();
    const after = (editedByStudent.get(code) || []).slice().sort();
    const removed = before.filter(club => !after.includes(club));
    const added = after.filter(club => !before.includes(club));
    const student = students.get(code);
    const studentName = student ? student.name : '';

    while (removed.length && added.length) {
      changes.push({ action:'Moved', studentName, code, fromClub:removed.shift(), toClub:added.shift() });
    }
    removed.forEach(fromClub => changes.push({ action:'Removed', studentName, code, fromClub, toClub:'' }));
    added.forEach(toClub => changes.push({ action:'Added', studentName, code, fromClub:'', toClub }));
  });

  return changes;
}


// Workflow stabilization v1: production Forms import plus controlled sheet-seeded test fallback.
function runFirstTimeSetupFromWorkflow() {
  const result = firstTimeSetup();
  const ss = SpreadsheetApp.getActive();
  const start = ss.getSheetByName(RM.sheets.start);
  if (start) { try { start.hideSheet(); } catch (error) { console.warn(error); } }
  return rebuildWorkflowState();
}
function checkForStudentFormFromWorkflow() {
  return rebuildWorkflowState();
}
function openCodedChoicesExportFromWorkflow() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(RM.sheets.codedChoices) || ss.getSheetByName('Coded Choices Export');
  if (!sheet) throw new Error('Coded Choices Export has not been created yet.');
  sheet.showSheet();
  sheet.activate();
  return rebuildWorkflowState();
}
function refreshChoicesIncludingSeededTests() {
  const liveResult=refreshCodedChoicesFromResponses();
  if(!liveResult||!liveResult.ok){const failed=rebuildWorkflowState();failed.liveImport=liveResult||null;failed.seededRowsAdded=0;failed.paperEntries=null;return failed;}
  const paperResult=mergeTeacherEnteredChoicesIntoCodedExport_();
  const problems=SpreadsheetApp.getActive().getSheetByName('Response Problems');
  const problemCount=problems?Math.max(0,problems.getLastRow()-1):0;
  if(problemCount>0){setWorkbookSetting_('coded_choices_export_valid','FALSE');setWorkbookSetting_('coded_choices_matched_count','0');throw new Error(problemCount+' response problem(s) remain. Coded Choices Export is not ready for import.');}
  const output=SpreadsheetApp.getActive().getSheetByName(RM.sheets.codedChoices);const finalCount=output?Math.max(0,output.getLastRow()-1):0;
  setWorkbookSetting_('coded_choices_matched_count',String(finalCount));setWorkbookSetting_('coded_choices_export_valid','TRUE');
  const state=rebuildWorkflowState();state.liveImport=liveResult;state.seededRowsAdded=0;state.seededRowsSkipped=0;state.seededRowsUnmatched=0;state.paperEntries=paperResult;return state;
}
function appendSeededResponseRowsToCodedChoices_() {
  const ss = SpreadsheetApp.getActive();
  const responseSheet = findFormResponseSheet_();
  const output = ss.getSheetByName(RM.sheets.codedChoices) || ss.getSheetByName('Coded Choices Export');
  const studentMap = ss.getSheetByName(RM.sheets.studentMap) || ss.getSheetByName('Student Map');
  if (!responseSheet || !output || !studentMap || responseSheet.getLastRow() < 2 || studentMap.getLastRow() < 2) return { added:0, skipped:0, unmatched:0 };

  const responseValues = responseSheet.getDataRange().getDisplayValues();
  const outputValues = output.getDataRange().getDisplayValues();
  const mapValues = studentMap.getDataRange().getDisplayValues();
  if (!responseValues.length || !outputValues.length || !mapValues.length) return { added:0, skipped:0, unmatched:0 };

  const norm = value => String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const headerIndex = headers => { const map = new Map(); headers.forEach((value,index)=>map.set(norm(value),index)); return map; };
  const responseHeaders = responseValues[0].map(String);
  const outputHeaders = outputValues[0].map(String);
  const mapHeaders = headerIndex(mapValues[0]);
  const outHeaders = headerIndex(outputHeaders);
  const responseHeaderMap = headerIndex(responseHeaders);
  const findIndex = (map,names) => { for (const name of names) { const target=norm(name); if (map.has(target)) return map.get(target); for (const [header,index] of map.entries()) if (header.startsWith(target+' ')) return index; } return -1; };

  const mapCodeI = findIndex(mapHeaders,['student code','student_code','code']);
  const mapNameI = findIndex(mapHeaders,['student name','student_name','name']);
  const mapEmailI = findIndex(mapHeaders,['student email','student_email','email','email address']);
  const mapGradeI = findIndex(mapHeaders,['grade']);
  const mapHomeI = findIndex(mapHeaders,['teacher homeroom text','teacher_homeroom_text','homeroom','teacher']);
  const responseNameI = findIndex(responseHeaderMap,['student name','student_name','name']);
  const responseEmailI = findIndex(responseHeaderMap,['student email','student_email','email','email address']);
  const responseMaxI = findIndex(responseHeaderMap,['max clubs','max_clubs','maximum clubs','how many clubs']);
  const outCodeI = findIndex(outHeaders,['student code','student_code','code']);
  const outGradeI = findIndex(outHeaders,['grade']);
  const outHomeI = findIndex(outHeaders,['homeroom','teacher homeroom text','teacher_homeroom_text']);
  const outMaxI = findIndex(outHeaders,['max clubs','max_clubs']);
  if (mapCodeI < 0 || outCodeI < 0) throw new Error('Seeded test import could not identify the student-code columns.');

  const identity = new Map();
  mapValues.slice(1).forEach(row => {
    const record = { code:String(row[mapCodeI]||'').trim(), grade:mapGradeI>=0?String(row[mapGradeI]||'').trim():'', homeroom:mapHomeI>=0?String(row[mapHomeI]||'').trim():'' };
    if (!record.code) return;
    if (mapEmailI >= 0 && row[mapEmailI]) identity.set('e:'+norm(row[mapEmailI]),record);
    if (mapNameI >= 0 && row[mapNameI]) identity.set('n:'+norm(row[mapNameI]),record);
  });
  const existingCodes = new Set(outputValues.slice(1).map(row=>String(row[outCodeI]||'').trim()).filter(Boolean));
  const responseByNormalized = new Map();
  responseHeaders.forEach((header,index)=>responseByNormalized.set(norm(header),index));
  const rows=[];
  let skipped=0, unmatched=0;
  responseValues.slice(1).forEach(source => {
    const email = responseEmailI>=0?norm(source[responseEmailI]):'';
    const name = responseNameI>=0?norm(source[responseNameI]):'';
    const record = (email?identity.get('e:'+email):null) || (name?identity.get('n:'+name):null);
    if (!record) { if (source.some(Boolean)) unmatched++; return; }
    if (existingCodes.has(record.code)) { skipped++; return; }
    const row = new Array(outputHeaders.length).fill('');
    row[outCodeI]=record.code;
    if(outGradeI>=0)row[outGradeI]=record.grade;
    if(outHomeI>=0)row[outHomeI]=record.homeroom;
    if(outMaxI>=0&&responseMaxI>=0)row[outMaxI]=String(source[responseMaxI]||'').replace(/[^0-9]/g,'');
    outputHeaders.forEach((header,index)=>{
      if(index===outCodeI||index===outGradeI||index===outHomeI||index===outMaxI)return;
      const sourceI=responseByNormalized.get(norm(header));
      if(sourceI!==undefined)row[index]=source[sourceI]||'';
    });
    rows.push(row); existingCodes.add(record.code);
  });
  if (rows.length) output.getRange(output.getLastRow()+1,1,rows.length,outputHeaders.length).setValues(rows);
  setWorkbookSetting_('coded_choices_matched_count', String(Math.max(0,output.getLastRow()-1)));
  SpreadsheetApp.flush();
  return { added:rows.length, skipped:skipped, unmatched:unmatched };
}


function validateEditedRosters() {
  try {
    return validateEditedRostersOnce_();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const transient = message.indexOf('Service Spreadsheets failed') >= 0 || message.indexOf('Internal error') >= 0 || message.indexOf('temporarily unavailable') >= 0;
    if (!transient) throw error;
    Utilities.sleep(1800);
    try { return validateEditedRostersOnce_(); }
    catch (retryError) {
      const details = retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error('Google Sheets was temporarily unavailable while checking the roster. No roster data was changed. Wait a moment, then run Validate roster changes again. Details: ' + details);
    }
  }
}
