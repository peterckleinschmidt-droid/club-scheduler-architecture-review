const PAPER_ENTRY_SHEET = 'Teacher-Entered Choices';
const PAPER_ENTRY_HEADER_ROW = 6;
const PAPER_ENTRY_FIRST_DATA_ROW = 7;

function paperEntryNormalize_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
function paperEntryHeaders_(clubs) {
  return ['Student name','Grade','Homeroom','How many clubs?','Top choice']
    .concat(clubs.map(function(club){ return club.display; }))
    .concat(['If duplicate, use','Status','Student Code']);
}
function paperEntryClubFromDisplay_(display, grades) {
  const parsed = parseDisplayClubName_(String(display || '').trim());
  return {title:parsed.title,section:parsed.section,display:String(display || '').trim(),gradeLimited:Boolean(grades && grades.length && grades.length < 3),eligibleGrades:(grades || []).map(String)};
}
function paperEntryClubsFromReference_() {
  const map = readClubReference_(SpreadsheetApp.getActive());
  return [...map.values()].map(function(club){
    return {title:club.title,section:club.section,display:club.section ? club.title + ' (' + club.section + ')' : club.title,gradeLimited:Boolean(club.gradeLimited),eligibleGrades:(club.eligibleGrades || []).map(String)};
  });
}
function paperEntryClubsFromForm_() {
  const formId = getWorkbookSetting_('google_student_form_id');
  if (!formId) return [];
  try {
    const questionMap = buildFormQuestionMapFromItems_(FormApp.openById(formId));
    const byDisplay = new Map();
    questionMap.clubItems.forEach(function(item){
      const display=String(item.display || '').trim(); if(!display)return;
      const key=paperEntryNormalize_(display); const current=byDisplay.get(key) || {display:display,grades:[]};
      if(item.grade && !current.grades.includes(String(item.grade))) current.grades.push(String(item.grade));
      byDisplay.set(key,current);
    });
    return [...byDisplay.values()].map(function(item){ return paperEntryClubFromDisplay_(item.display,item.grades); });
  } catch(error) { console.warn('Could not read clubs from the student Form.',error); return []; }
}
function paperEntryClubsFromCodedExport_() {
  const sheet=SpreadsheetApp.getActive().getSheetByName(RM.sheets.codedChoices);
  if(!sheet || sheet.getLastColumn() < 6)return [];
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  return headers.slice(5).map(function(display){return paperEntryClubFromDisplay_(display,[]);}).filter(function(club){return club.display;});
}
function paperEntryClubs_() {
  const sources=[paperEntryClubsFromReference_(),paperEntryClubsFromForm_(),paperEntryClubsFromCodedExport_()];
  for(let i=0;i<sources.length;i+=1)if(sources[i].length)return sources[i];
  return [];
}
function paperEntryAllowsGrade_(club,grade){return !club.gradeLimited || !club.eligibleGrades.length || club.eligibleGrades.includes(String(grade));}
function paperEntryExistingRows_(sheet) {
  if (!sheet || sheet.getLastRow() < PAPER_ENTRY_FIRST_DATA_ROW) return [];
  const lastCol = Math.max(1, sheet.getLastColumn());
  const rawHeaders = sheet
    .getRange(PAPER_ENTRY_HEADER_ROW, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  const headers = rawHeaders.map(paperEntryNormalize_);
  const values = sheet
    .getRange(
      PAPER_ENTRY_FIRST_DATA_ROW,
      1,
      sheet.getLastRow() - PAPER_ENTRY_HEADER_ROW,
      lastCol
    )
    .getDisplayValues();

  function index(names) {
    for (let i = 0; i < names.length; i += 1) {
      const hit = headers.indexOf(paperEntryNormalize_(names[i]));
      if (hit >= 0) return hit;
    }
    return -1;
  }

  const fixedHeaders = new Set([
    'Student name',
    'Grade',
    'Homeroom',
    'How many clubs?',
    'Top choice',
    'If duplicate, use',
    'Use this response',
    'Status',
    'Student Code',
    'New Student'
  ].map(paperEntryNormalize_));
  const ratingIndexes = [];
  rawHeaders.forEach(function(header, columnIndex) {
    if (header && !fixedHeaders.has(paperEntryNormalize_(header))) {
      ratingIndexes.push({ header: header, columnIndex: columnIndex });
    }
  });

  const nameI = index(['Student name']);
  const gradeI = index(['Grade']);
  const homeI = index(['Homeroom']);
  const maxI = index(['How many clubs?']);
  const topI = index(['Top choice']);
  const useI = index(['If duplicate, use', 'Use this response']);
  const statusI = index(['Status']);
  const codeI = index(['Student Code', 'New Student']);

  return values
    .map(function(row) {
      const ratings = {};
      ratingIndexes.forEach(function(item) {
        ratings[paperEntryNormalize_(item.header)] = String(row[item.columnIndex] || '').trim();
      });
      return {
        name: nameI >= 0 ? row[nameI] : '',
        grade: gradeI >= 0 ? row[gradeI] : '',
        homeroom: homeI >= 0 ? row[homeI] : '',
        maxClubs: maxI >= 0 ? row[maxI] : '',
        topChoice: topI >= 0 ? row[topI] : '',
        ratings: ratings,
        use: useI >= 0 ? row[useI] : '',
        status: statusI >= 0 ? row[statusI] : '',
        code: codeI >= 0 ? row[codeI] : ''
      };
    })
    .filter(function(row) {
      return [row.name, row.grade, row.homeroom, row.maxClubs, row.topChoice]
        .concat(Object.values(row.ratings))
        .some(function(value) { return String(value).trim(); });
    });
}
function ensureTeacherEnteredChoicesSheet_(){
  const ss=SpreadsheetApp.getActive(); const clubs=paperEntryClubs_();
  if(!clubs.length)throw new Error('The current club list could not be found. Create or reconnect the student Form, then try Enter paper responses again. No paper-entry sheet was changed.');
  let sheet=ss.getSheetByName(PAPER_ENTRY_SHEET); const preserved=paperEntryExistingRows_(sheet); const headers=paperEntryHeaders_(clubs);
  if(!sheet)sheet=ss.insertSheet(PAPER_ENTRY_SHEET);
  if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  if(sheet.getMaxRows()<107)sheet.insertRowsAfter(sheet.getMaxRows(),107-sheet.getMaxRows());
  sheet.getDataRange().breakApart(); sheet.clear(); sheet.clearFormats(); sheet.clearConditionalFormatRules();
  sheet.getRange(1,1,1,headers.length).merge().setValue('Teacher-entered choices').setFontSize(18).setFontWeight('bold').setBackground('#16324F').setFontColor('#FFFFFF');
  sheet.getRange(2,1,1,headers.length).merge().setValue('Use this sheet only for students whose choices were collected on paper. Most students should continue using the Google Form.');
  sheet.getRange(3,1,1,headers.length).merge().setValue('Enter one student per row. Rate every available club, then use Prepare student choices in Google Workflow.');
  sheet.getRange(4,1,1,headers.length).merge().setValue('Only rows marked Check student or Fix row need attention. Clearly new students are added automatically.');
  sheet.getRange(PAPER_ENTRY_HEADER_ROW,1,1,headers.length).setValues([headers]).setBackground('#D9EAF7').setFontWeight('bold').setWrap(true);
  if(preserved.length){const rows=preserved.map(function(row){return [row.name,row.grade,row.homeroom,row.maxClubs,row.topChoice].concat(clubs.map(function(club){return row.ratings[paperEntryNormalize_(club.display)] || '';})).concat([row.use,row.status,row.code]);});sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,1,rows.length,headers.length).setValues(rows);}
  sheet.setFrozenRows(PAPER_ENTRY_HEADER_ROW);sheet.setTabColor('#7C3AED');sheet.setHiddenGridlines(false);
  const dataRows=sheet.getMaxRows()-PAPER_ENTRY_HEADER_ROW;
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,2,dataRows,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['3','4','5'],true).setAllowInvalid(false).build());
  const homeSheet=ss.getSheetByName('Homerooms');if(homeSheet&&homeSheet.getLastRow()>1){const homes=homeSheet.getRange(2,2,homeSheet.getLastRow()-1,1).getDisplayValues().flat().map(String).map(function(v){return v.trim();}).filter(Boolean);if(homes.length)sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,3,dataRows,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(unique_(homes),true).setAllowInvalid(false).build());}
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,4,dataRows,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['0','1','2','3'],true).setAllowInvalid(false).build());
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,5,dataRows,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(clubs.map(function(c){return c.display;}),true).setAllowInvalid(true).build());
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,6,dataRows,clubs.length).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Definitely','Maybe','No thanks'],true).setAllowInvalid(false).build());
  const useCol=6+clubs.length,statusCol=useCol+1,codeCol=useCol+2;
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,useCol,dataRows,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Student Form','Paper entry','Do not import'],true).setAllowInvalid(false).build());
  sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,statusCol,dataRows,1).setBackground('#F8FAFC').setFontColor('#475467');
  sheet.setColumnWidth(1,190);sheet.setColumnWidth(2,70);sheet.setColumnWidth(3,170);sheet.setColumnWidth(4,120);sheet.setColumnWidth(5,220);clubs.forEach(function(_,i){sheet.setColumnWidth(6+i,165);});sheet.setColumnWidth(useCol,130);sheet.setColumnWidth(statusCol,300);
  sheet.hideColumns(codeCol);sheet.hideColumns(useCol);sheet.showSheet();return sheet;
}
function openTeacherEnteredChoices(){const sheet=ensureTeacherEnteredChoicesSheet_();sheet.activate();return getPaperEntrySummary();}
function paperEntryDistance_(a,b){a=paperEntryNormalize_(a);b=paperEntryNormalize_(b);const m=Array.from({length:a.length+1},function(){return Array(b.length+1).fill(0);});for(let i=0;i<=a.length;i++)m[i][0]=i;for(let j=0;j<=b.length;j++)m[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return m[a.length][b.length];}
function resolvePaperStudent_(row,students){const exact=students.filter(function(s){return responseIdentityKey_(s.name,s.grade,s.homeroom)===responseIdentityKey_(row.name,row.grade,row.homeroom);});if(exact.length===1)return{student:exact[0],status:'matched'};if(exact.length>1)return{student:null,status:'check',message:'More than one existing student has this name, grade, and homeroom.'};const likely=students.filter(function(s){return String(s.grade)===String(row.grade)&&paperEntryNormalize_(s.homeroom)===paperEntryNormalize_(row.homeroom)&&paperEntryDistance_(s.name,row.name)<=2;});if(likely.length)return{student:null,status:'check',message:'This may be the same student as '+likely.map(function(s){return s.name;}).join(', ')+'. Correct the name or choose Paper entry to create a different student.'};const same=students.filter(function(s){return paperEntryNormalize_(s.name)===paperEntryNormalize_(row.name)&&String(s.grade)===String(row.grade);});if(same.length)return{student:null,status:'check',message:'A student with this name and grade already exists in another homeroom. Correct the homeroom or choose Paper entry to create a different student.'};return{student:null,status:'new'};}
function readTeacherEnteredChoices_(){const sheet=SpreadsheetApp.getActive().getSheetByName(PAPER_ENTRY_SHEET);const clubs=paperEntryClubs_();if(!sheet||sheet.getLastRow()<PAPER_ENTRY_FIRST_DATA_ROW)return{clubs:clubs,entries:[],sheet:sheet};const width=8+clubs.length,values=sheet.getRange(PAPER_ENTRY_FIRST_DATA_ROW,1,sheet.getLastRow()-PAPER_ENTRY_HEADER_ROW,width).getDisplayValues(),entries=[];values.forEach(function(row,index){if(!row.slice(0,5+clubs.length).some(function(v){return String(v).trim();}))return;const ratings={};clubs.forEach(function(club,i){ratings[club.display]=String(row[5+i]||'').trim();});entries.push({rowNumber:PAPER_ENTRY_FIRST_DATA_ROW+index,name:String(row[0]||'').trim(),grade:String(row[1]||'').trim(),homeroom:String(row[2]||'').trim(),maxClubs:String(row[3]||'').trim(),topChoice:String(row[4]||'').trim(),ratings:ratings,use:String(row[5+clubs.length]||'').trim(),useCol:6+clubs.length,statusCol:7+clubs.length,codeCol:8+clubs.length});});return{clubs:clubs,entries:entries,sheet:sheet};}
function validateAndConvertPaperEntries_(formCodes) {
  const source = readTeacherEnteredChoices_();
  const students = readStudentMapForResponses_();
  const converted = [];
  const issues = [];
  const seenCodes = new Map();
  const conflictRows = [];
  const summary = {
    total: source.entries.length,
    ready: 0,
    attention: 0,
    ignored: 0,
    newStudents: 0
  };

  source.entries.forEach(function(entry) {
    let status = '';
    let code = '';
    let student = null;

    function problem(message, kind) {
      status = (kind || 'Fix row') + ': ' + message;
      issues.push([
        entry.rowNumber,
        entry.name,
        '',
        message,
        'Open Teacher-Entered Choices and correct this row.'
      ]);
      summary.attention += 1;
    }

    if (paperEntryNormalize_(entry.use) === 'do not import') {
      status = 'Not imported';
      summary.ignored += 1;
    } else if (!entry.name || !['3', '4', '5'].includes(entry.grade) || !entry.homeroom) {
      problem('Enter the student name, grade, and homeroom.');
    } else {
      const resolved = resolvePaperStudent_(entry, students);

      if (resolved.status === 'check' && paperEntryNormalize_(entry.use) !== 'paper entry') {
        problem(resolved.message, 'Check student');
      } else {
        student = resolved.student;

        if (!student) {
          student = createStudentIdentityFromResponse_({
            name: entry.name,
            email: '',
            grade: entry.grade,
            homeroom: entry.homeroom
          });
          students.push(student);
          summary.newStudents += 1;
        }

        code = student.code;

        if (formCodes.has(code) && !entry.use) {
          problem(
            'Choices were found in both places. Use the If duplicate, use column.',
            'Check student'
          );
          conflictRows.push(entry.rowNumber);
        } else if (
          formCodes.has(code) &&
          paperEntryNormalize_(entry.use) === 'student form'
        ) {
          status = 'Using student Form';
          summary.ignored += 1;
        } else if (seenCodes.has(code)) {
          problem('More than one paper entry was found for this student.', 'Check student');
        } else {
          seenCodes.set(code, entry.rowNumber);
          const eligible = source.clubs.filter(function(club) {
            return paperEntryAllowsGrade_(club, entry.grade);
          });

          if (
            entry.maxClubs === '' ||
            Number(entry.maxClubs) < 0 ||
            Number(entry.maxClubs) > 3
          ) {
            problem('Choose how many clubs the student wants.');
          } else if (
            eligible.length &&
            Number(entry.maxClubs) > 0 &&
            !entry.topChoice
          ) {
            problem("Choose the student's top-choice club.");
          } else {
            const top = source.clubs.find(function(club) {
              return paperEntryNormalize_(club.display) === paperEntryNormalize_(entry.topChoice);
            });

            if (
              entry.topChoice &&
              (!top || !paperEntryAllowsGrade_(top, entry.grade))
            ) {
              problem('The top choice is not available for this grade.');
            } else {
              let invalid = false;

              source.clubs.forEach(function(club) {
                const answer = normalizeInterestResponse_(
                  entry.ratings[club.display] || 'No thanks'
                );
                if (
                  !paperEntryAllowsGrade_(club, entry.grade) &&
                  answer !== 'No thanks'
                ) {
                  invalid = true;
                }
              });

              if (invalid) {
                problem(
                  'A positive choice was entered for a club that is not available to this grade.'
                );
              } else if (
                top &&
                normalizeInterestResponse_(entry.ratings[top.display] || 'No thanks') ===
                  'No thanks'
              ) {
                problem('The top-choice club must have a positive rating.');
              } else {
                const row = [
                  code,
                  entry.grade,
                  homeroomCodeFor_(entry.homeroom),
                  entry.maxClubs,
                  entry.topChoice
                ];

                source.clubs.forEach(function(club) {
                  row.push(
                    paperEntryAllowsGrade_(club, entry.grade)
                      ? normalizeInterestResponse_(entry.ratings[club.display] || 'No thanks')
                      : 'No thanks'
                  );
                });

                converted.push({
                  code: code,
                  row: row,
                  replaceForm: formCodes.has(code)
                });
                status = 'Ready';
                summary.ready += 1;
              }
            }
          }
        }
      }
    }

    if (source.sheet) {
      source.sheet.getRange(entry.rowNumber, entry.statusCol).setValue(status);
      source.sheet.getRange(entry.rowNumber, entry.codeCol).setValue(code);
      source.sheet
        .getRange(entry.rowNumber, 1, 1, entry.codeCol)
        .setBackground(
          status.startsWith('Ready')
            ? '#F0FDF4'
            : status.startsWith('Check')
              ? '#FFF2CC'
              : status.startsWith('Fix')
                ? '#FCE8E6'
                : null
        );
    }
  });

  if (source.sheet) {
    const useCol = 6 + source.clubs.length;
    source.sheet.hideColumns(useCol);
    if (conflictRows.length) source.sheet.showColumns(useCol);
  }

  return {
    clubs: source.clubs,
    converted: converted,
    issues: issues,
    summary: summary
  };
}

function mergeTeacherEnteredChoicesIntoCodedExport_(){const existingSheet=SpreadsheetApp.getActive().getSheetByName(PAPER_ENTRY_SHEET);if(!existingSheet)ensureTeacherEnteredChoicesSheet_();const output=SpreadsheetApp.getActive().getSheetByName(RM.sheets.codedChoices);if(!output)throw new Error('Coded Choices Export is not ready. Prepare student choices again.');const values=output.getDataRange().getDisplayValues(),headers=values[0]||baseCodedChoiceHeaders_(paperEntryClubs_()),codeIndex=headers.map(normalizeHeader_).indexOf('student code'),formRows=values.slice(1).filter(function(row){return row.some(function(v){return String(v).trim();});}),formCodes=new Set(formRows.map(function(row){return String(row[codeIndex]||'').trim();}).filter(Boolean)),paper=validateAndConvertPaperEntries_(formCodes),replaceCodes=new Set(paper.converted.filter(function(item){return item.replaceForm;}).map(function(item){return item.code;})),combined=formRows.filter(function(row){return !replaceCodes.has(String(row[codeIndex]||'').trim());});paper.converted.forEach(function(item){combined.push(item.row);});combined.sort(function(a,b){return String(a[0]).localeCompare(String(b[0]));});writeCodedChoicesExport_(headers,combined);const problems=SpreadsheetApp.getActive().getSheetByName('Response Problems'),existing=problems&&problems.getLastRow()>1?problems.getRange(2,1,problems.getLastRow()-1,5).getDisplayValues():[];writeResponseReview_(existing.concat(paper.issues));setWorkbookSetting_('paper_choices_total_count',String(paper.summary.total));setWorkbookSetting_('paper_choices_ready_count',String(paper.summary.ready));setWorkbookSetting_('paper_choices_issue_count',String(paper.summary.attention));setWorkbookSetting_('coded_choices_matched_count',String(combined.length));return paper.summary;}
function getPaperEntrySummary(){const source=readTeacherEnteredChoices_(),settings=getWorkbookSettingsMap_();return{total:source.entries.length,ready:Number(settings.get('paper choices ready count')||0),attention:Number(settings.get('paper choices issue count')||0)};}
