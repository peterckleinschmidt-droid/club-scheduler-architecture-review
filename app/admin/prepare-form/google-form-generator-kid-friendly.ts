type ClubForForm = {
  club_title: string;
  section_label: string | null;
  description: string | null;
  club_title_es?: string | null;
  section_label_es?: string | null;
  description_es?: string | null;
  spanish_translation_ready?: boolean | null;
  grade_limited: boolean | null;
  eligible_grade: number | null;
  eligible_grades?: number[] | string[] | null;
};

type TeacherForForm = { teacher_name: string };

type GenerateGoogleFormOptions = {
  accessToken: string;
  schoolYearLabel: string;
  blockLabel: string;
  teachers: TeacherForForm[];
  clubs: ClubForForm[];
  targetFolderId: string;
};

const GRADES = [3, 4, 5] as const;
const INTEREST_OPTIONS = ['I really want this club / Me interesa mucho este club', 'I might like this club / Tal vez me guste este club', 'No thanks / No, gracias'];
const MAX_CLUB_OPTIONS = ['1 club', '2 clubs', '3 clubs'];

type GoogleFormCreateResponse = { formId: string; responderUri?: string };
type GoogleForm = { items?: Array<any>; responderUri?: string };

function normalizeEligibleGrades(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value.map((item) => Number(item)).filter((item) => [3, 4, 5].includes(item));
}
function eligibleGradesForClub(club: ClubForForm) {
  if (!club.grade_limited) return [...GRADES];
  const eligibleGrades = normalizeEligibleGrades(club.eligible_grades);
  if (eligibleGrades.length > 0) return eligibleGrades;
  if (club.eligible_grade && [3, 4, 5].includes(club.eligible_grade)) return [club.eligible_grade];
  return [...GRADES];
}
function displayClubName(club: ClubForForm) {
  const english = club.section_label ? club.club_title + ' (' + club.section_label + ')' : club.club_title;
  if (!club.spanish_translation_ready || !club.club_title_es) return english;
  const spanish = club.section_label_es ? club.club_title_es + ' (' + club.section_label_es + ')' : club.club_title_es;
  return english.trim().toLowerCase() === spanish.trim().toLowerCase() ? english : english + ' / ' + spanish;
}
function clubDescription(club: ClubForForm) {
  const english = String(club.description || '').trim() || 'Choose how interested you are in this club.';
  const spanish = club.spanish_translation_ready ? String(club.description_es || '').trim() : '';
  return spanish ? english + '\n\n' + spanish : english;
}
async function googleJson<T>({ accessToken, url, method, body }: { accessToken: string; url: string; method: 'GET' | 'POST' | 'PATCH'; body?: unknown }) {
  const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Google request failed with status ' + response.status + '.');
  return json as T;
}
async function moveFormToFolder({ accessToken, formId, folderId }: { accessToken: string; formId: string; folderId: string }) {
  await googleJson({ accessToken, url: 'https://www.googleapis.com/drive/v3/files/' + formId + '?addParents=' + encodeURIComponent(folderId) + '&fields=id,parents', method: 'PATCH', body: {} });
}
async function batchUpdate(accessToken: string, formId: string, requests: unknown[]) {
  if (requests.length === 0) return;
  await googleJson({ accessToken, url: 'https://forms.googleapis.com/v1/forms/' + formId + ':batchUpdate', method: 'POST', body: { requests } });
}
function addItemRequest(item: Record<string, unknown>, index: number) { return { createItem: { item, location: { index } } }; }
function textQuestion(required = true) { return { questionItem: { question: { required, textQuestion: { paragraph: false } } } }; }
function choiceQuestion(options: Array<Record<string, unknown> | string>, type: 'RADIO' | 'DROP_DOWN' = 'RADIO') {
  return { questionItem: { question: { required: true, choiceQuestion: { type, options: options.map(option => typeof option === 'string' ? { value: option } : option), shuffle: false } } } };
}
async function getForm(accessToken: string, formId: string) { return googleJson<GoogleForm>({ accessToken, url: 'https://forms.googleapis.com/v1/forms/' + formId, method: 'GET' }); }
async function updateChoiceRouting({ accessToken, formId, item, options }: { accessToken: string; formId: string; item: any; options: Array<Record<string, unknown>> }) {
  const form = await getForm(accessToken, formId);
  const index = form.items?.findIndex((candidate: any) => candidate.itemId === item.itemId) ?? 0;
  await batchUpdate(accessToken, formId, [{ updateItem: { item: { itemId: item.itemId, title: item.title, questionItem: { question: { questionId: item.questionItem.question.questionId, required: true, choiceQuestion: { type: 'RADIO', options, shuffle: false } } } }, location: { index: Math.max(0, index) }, updateMask: 'questionItem.question.choiceQuestion.options,questionItem.question.required' } }]);
}
export async function generateGoogleForm(options: GenerateGoogleFormOptions) {
  const title = options.schoolYearLabel + ' ' + options.blockLabel + ' Club Choices';
  const created = await googleJson<GoogleFormCreateResponse>({ accessToken: options.accessToken, url: 'https://forms.googleapis.com/v1/forms', method: 'POST', body: { info: { title, documentTitle: title } } });
  if (!created.formId) throw new Error('Google did not return a form ID.');
  try { await moveFormToFolder({ accessToken: options.accessToken, formId: created.formId, folderId: options.targetFolderId }); } catch (error) { console.warn('Form was created but could not be moved to the session folder.', error); }
  const clubsByGrade = new Map<number, ClubForForm[]>();
  GRADES.forEach(grade => clubsByGrade.set(grade, []));
  options.clubs.forEach(club => eligibleGradesForClub(club).forEach(grade => clubsByGrade.get(grade)?.push(club)));
  GRADES.forEach(grade => clubsByGrade.get(grade)?.sort((a, b) => displayClubName(a).localeCompare(displayClubName(b))));
  const requests: unknown[] = [];
  let index = 0;
  requests.push({ updateFormInfo: { info: { description: 'Tell us which clubs you are interested in. We will try to give students clubs they are excited about, but not everyone will get every club they choose.\n\nDinos qué clubes te interesan. Trataremos de asignarte clubes que te entusiasmen, pero no todos recibirán cada club que elijan.' }, updateMask: 'description' } });
  requests.push(addItemRequest({ title: 'What is your full name? / ¿Cuál es tu nombre completo?', description: 'Type your first and last name. / Escribe tu nombre y apellido.', ...textQuestion(true) }, index++));
  requests.push(addItemRequest({ title: 'What grade are you in? / ¿En qué grado estás?', ...choiceQuestion(GRADES.map(String), 'RADIO') }, index++));
  requests.push(addItemRequest({ title: 'Who is your homeroom teacher? / ¿Quién es tu maestro o maestra de salón?', ...choiceQuestion(options.teachers.map(teacher => teacher.teacher_name), 'DROP_DOWN') }, index++));
  GRADES.forEach(grade => {
    const gradeClubs = clubsByGrade.get(grade) || [];
    requests.push(addItemRequest({ title: 'Grade ' + grade + ' clubs', description: 'Choose how interested you are in each club. / Indica cuánto te interesa cada club.', pageBreakItem: {} }, index++));
    if (gradeClubs.length === 0) requests.push(addItemRequest({ title: 'No clubs are currently available for Grade ' + grade + '.', description: 'Ask your teacher or club coordinator if you think this is a mistake.', textItem: {} }, index++));
    else {
      gradeClubs.forEach(club => requests.push(addItemRequest({ title: 'How interested are you in ' + displayClubName(club) + '?', description: clubDescription(club), ...choiceQuestion(INTEREST_OPTIONS, 'RADIO') }, index++)));
      requests.push(addItemRequest({ title: 'How many clubs would you like to join? / ¿En cuántos clubes te gustaría participar?', description: 'Pick the total number of clubs you would like if your schedule allows it. / Elige cuántos clubes te gustaría tener si tu horario lo permite.', ...choiceQuestion(MAX_CLUB_OPTIONS, 'RADIO') }, index++));
      requests.push(addItemRequest({ title: 'If you could only get one club, which one would you want most? / Si solo pudieras participar en un club, ¿cuál preferirías?', description: 'Try to pick one you marked "I really want this club." / Elige uno que marcaste como "Me interesa mucho este club".', ...choiceQuestion(gradeClubs.map(displayClubName), 'RADIO') }, index++));
    }
  });
  await batchUpdate(options.accessToken, created.formId, requests);
  const form = await getForm(options.accessToken, created.formId);
  const items = form.items || [];
  const gradeQuestion = items.find((item: any) => item.title === 'What grade are you in? / ¿En qué grado estás?');
  const gradeSections = new Map<string, string>();
  items.forEach((item: any) => { const match = String(item.title || '').match(/^Grade ([345]) clubs$/); if (match && item.itemId) gradeSections.set(match[1], item.itemId); });
  if (gradeQuestion?.itemId && gradeQuestion?.questionItem?.question?.questionId && gradeSections.size === GRADES.length) {
    await updateChoiceRouting({ accessToken: options.accessToken, formId: created.formId, item: gradeQuestion, options: GRADES.map(grade => ({ value: String(grade), goToSectionId: gradeSections.get(String(grade)) })) });
  }
  const afterRouting = await getForm(options.accessToken, created.formId);
  const topChoiceQuestions = (afterRouting.items || []).filter((item: any) => item.title === 'If you could only get one club, which one would you want most? / Si solo pudieras participar en un club, ¿cuál preferirías?');
  for (const item of topChoiceQuestions) {
    const choices = item?.questionItem?.question?.choiceQuestion?.options || [];
    if (item?.itemId && item?.questionItem?.question?.questionId && choices.length) {
      await updateChoiceRouting({ accessToken: options.accessToken, formId: created.formId, item, options: choices.map((choice: any) => ({ value: choice.value, goToAction: 'SUBMIT_FORM' })) });
    }
  }
  const refreshed = await getForm(options.accessToken, created.formId);
  return { formId: created.formId, editUrl: 'https://docs.google.com/forms/d/' + created.formId + '/edit', responderUrl: refreshed.responderUri || 'https://docs.google.com/forms/d/' + created.formId + '/viewform' };
}
