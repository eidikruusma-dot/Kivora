import type { AppLang } from '@/lib/languageStore'

// ── Translation keys ───────────────────────────────────────────────────────
export type TranslationKey =
  // ── Sidebar nav ──────────────────────────────────────────────────────────
  | 'nav.myDay' | 'nav.tasks' | 'nav.calendar' | 'nav.notes'
  | 'nav.habits' | 'nav.goals' | 'nav.assistant' | 'nav.school'
  | 'nav.help' | 'nav.settings'
  // ── Sidebar footer ────────────────────────────────────────────────────────
  | 'sidebar.darkMode'
  // ── Header user menu ──────────────────────────────────────────────────────
  | 'header.myProfile' | 'header.logout' | 'header.user'
  // ── Settings — section headings ───────────────────────────────────────────
  | 'settings.section.account' | 'settings.section.app'
  | 'settings.section.data' | 'settings.section.support'
  // ── Settings — card titles ────────────────────────────────────────────────
  | 'settings.card.profile' | 'settings.card.security' | 'settings.card.email'
  | 'settings.card.privacy' | 'settings.card.appearance' | 'settings.card.notifications'
  | 'settings.card.datetime' | 'settings.card.language' | 'settings.card.sync'
  | 'settings.card.backup' | 'settings.card.export' | 'settings.card.delete'
  | 'settings.card.helpSupport' | 'settings.card.whatsNew' | 'settings.card.feedback'
  | 'settings.card.appInfo'
  // ── Settings — sidebar ────────────────────────────────────────────────────
  | 'settings.usage.title' | 'settings.usage.storage' | 'settings.usage.ai'
  | 'settings.usage.projects' | 'settings.quick.title' | 'settings.quick.changePassword'
  | 'settings.quick.downloadData' | 'settings.quick.checkSync' | 'settings.quick.contactSupport'
  // ── Public nav ────────────────────────────────────────────────────────────
  | 'pub.nav.features' | 'pub.nav.howItWorks' | 'pub.nav.about'
  | 'pub.nav.login' | 'pub.nav.start'
  // ── Public footer ─────────────────────────────────────────────────────────
  | 'footer.privacy' | 'footer.terms' | 'footer.contact' | 'footer.copyright'
  // ── Shared public ─────────────────────────────────────────────────────────
  | 'pub.backToHome' | 'pub.or'
  // ── Auth shell ───────────────────────────────────────────────────────────
  | 'auth.brandTagline' | 'auth.brandSubtitle' | 'auth.copyright'
  // ── Social buttons ────────────────────────────────────────────────────────
  | 'social.loginWith' | 'social.registerWith' | 'social.loading'
  // ── Landing page ─────────────────────────────────────────────────────────
  | 'landing.badge' | 'landing.hero.title' | 'landing.hero.subtitle'
  | 'landing.cta.start' | 'landing.cta.login' | 'landing.cta.free'
  | 'landing.features.title' | 'landing.features.subtitle'
  | 'landing.feat.tasks.title' | 'landing.feat.tasks.desc'
  | 'landing.feat.calendar.title' | 'landing.feat.calendar.desc'
  | 'landing.feat.notes.title' | 'landing.feat.notes.desc'
  | 'landing.feat.habits.title' | 'landing.feat.habits.desc'
  | 'landing.feat.goals.title' | 'landing.feat.goals.desc'
  | 'landing.feat.ai.title' | 'landing.feat.ai.desc'
  | 'landing.how.title' | 'landing.how.subtitle'
  | 'landing.step1.title' | 'landing.step1.desc'
  | 'landing.step2.title' | 'landing.step2.desc'
  | 'landing.step3.title' | 'landing.step3.desc'
  | 'landing.about.title' | 'landing.about.tagline'
  | 'landing.about.p1' | 'landing.about.p2' | 'landing.about.p3'
  | 'landing.about.quote' | 'landing.about.p4' | 'landing.about.p5'
  | 'landing.principles.title'
  | 'landing.principle.0' | 'landing.principle.1' | 'landing.principle.2'
  | 'landing.principle.3' | 'landing.principle.4'
  | 'landing.mission.title' | 'landing.mission.text'
  | 'landing.vision.title' | 'landing.vision.text'
  | 'landing.cta2.title' | 'landing.cta2.subtitle' | 'landing.finalTagline'
  // ── Login ─────────────────────────────────────────────────────────────────
  | 'login.title' | 'login.subtitle' | 'login.noAccount' | 'login.createAccount'
  | 'login.email' | 'login.password' | 'login.forgotPassword'
  | 'login.rememberMe' | 'login.submit' | 'login.loading'
  | 'login.hidePassword' | 'login.showPassword' | 'login.emailNotVerified'
  // ── Register ──────────────────────────────────────────────────────────────
  | 'reg.title' | 'reg.subtitle' | 'reg.hasAccount' | 'reg.login'
  | 'reg.name' | 'reg.namePlaceholder' | 'reg.email' | 'reg.password'
  | 'reg.confirmPassword' | 'reg.agree' | 'reg.terms' | 'reg.and' | 'reg.privacy'
  | 'reg.submit' | 'reg.loading'
  | 'reg.error.required' | 'reg.error.email' | 'reg.error.mismatch'
  | 'reg.error.weak' | 'reg.error.terms'
  | 'reg.success.title' | 'reg.success.subtitle' | 'reg.success.body' | 'reg.success.goLogin'
  // ── Forgot password ───────────────────────────────────────────────────────
  | 'forgot.title' | 'forgot.subtitle' | 'forgot.submit' | 'forgot.loading'
  | 'forgot.backToLogin' | 'forgot.error.required' | 'forgot.error.email'
  | 'forgot.sent.title' | 'forgot.sent.body'
  // ── Reset password ────────────────────────────────────────────────────────
  | 'reset.checking' | 'reset.expired.title' | 'reset.expired.body'
  | 'reset.expired.sendNew' | 'reset.success.title' | 'reset.success.changed'
  | 'reset.success.redirect' | 'reset.success.goLogin'
  | 'reset.form.title' | 'reset.form.subtitle' | 'reset.form.newPassword'
  | 'reset.form.confirmPassword' | 'reset.form.hidePassword' | 'reset.form.showPassword'
  | 'reset.submit' | 'reset.saving' | 'reset.backToLogin'
  | 'reset.error.length' | 'reset.error.mismatch'
  // ── Verify email ──────────────────────────────────────────────────────────
  | 'verify.sent.title' | 'verify.sent.text'
  | 'verify.verified.title' | 'verify.verified.text'
  | 'verify.expired.title' | 'verify.expired.text'
  | 'verify.resend' | 'verify.resending'
  | 'verify.checkStatus' | 'verify.checking'
  | 'verify.logout' | 'verify.backToLogin' | 'verify.login'
  // ── Contact ───────────────────────────────────────────────────────────────
  | 'contact.title' | 'contact.subtitle'
  | 'contact.desc1' | 'contact.desc2' | 'contact.desc3'
  | 'contact.form.name' | 'contact.form.namePlaceholder'
  | 'contact.form.email' | 'contact.form.emailPlaceholder'
  | 'contact.form.subject' | 'contact.form.subjectPlaceholder'
  | 'contact.form.message' | 'contact.form.messagePlaceholder'
  | 'contact.form.submit' | 'contact.form.submitting'
  | 'contact.success' | 'contact.error'
  | 'contact.info.title' | 'contact.info.website' | 'contact.info.email'
  | 'contact.privacy.title' | 'contact.privacy.text' | 'contact.thanks'
  // ── Terms ─────────────────────────────────────────────────────────────────
  | 'terms.title' | 'terms.updated'
  // ── Privacy ───────────────────────────────────────────────────────────────
  | 'privacy.title' | 'privacy.updated'
  // ── Dashboard / HeroCard ─────────────────────────────────────────────────
  | 'hero.morning' | 'hero.afternoon' | 'hero.evening'
  | 'hero.tasks' | 'hero.events' | 'hero.goals' | 'hero.habits'
  // ── Daily messages ────────────────────────────────────────────────────────
  | 'daily.mon' | 'daily.tue' | 'daily.wed' | 'daily.thu'
  | 'daily.fri' | 'daily.sat' | 'daily.sun' | 'daily.default'
  // ── Tasks page ────────────────────────────────────────────────────────────
  | 'tasks.title' | 'tasks.subtitle' | 'tasks.add'
  | 'tasks.filter.all' | 'tasks.filter.active' | 'tasks.filter.done'
  | 'tasks.empty.title' | 'tasks.empty.body'
  | 'tasks.progress.title' | 'tasks.stat.done' | 'tasks.stat.active' | 'tasks.stat.total'
  | 'tasks.priorities.title'
  | 'tasks.priority.high' | 'tasks.priority.medium' | 'tasks.priority.low'
  | 'tasks.ai.title' | 'tasks.ai.body'
  | 'tasks.action.edit' | 'tasks.action.delete'
  // ── Task modal ────────────────────────────────────────────────────────────
  | 'taskModal.addTitle' | 'taskModal.editTitle'
  | 'taskModal.titleLabel' | 'taskModal.titlePlaceholder'
  | 'taskModal.descLabel' | 'taskModal.descPlaceholder'
  | 'taskModal.dateLabel' | 'taskModal.timeLabel'
  | 'taskModal.priorityLabel' | 'taskModal.categoryLabel'
  | 'taskModal.save' | 'taskModal.cancel' | 'taskModal.error'
  // ── Task categories ───────────────────────────────────────────────────────
  | 'cat.work' | 'cat.school' | 'cat.personal' | 'cat.family'
  | 'cat.health' | 'cat.shopping'
  // ── Notes page ────────────────────────────────────────────────────────────
  | 'notes.title' | 'notes.subtitle' | 'notes.add'
  | 'notes.searchPlaceholder' | 'notes.all'
  | 'notes.empty.title' | 'notes.empty.body'
  | 'notes.overview.title' | 'notes.label'
  | 'notes.folders.title' | 'notes.ai.title' | 'notes.ai.body'
  | 'notes.menu.open' | 'notes.menu.edit' | 'notes.menu.move' | 'notes.menu.delete'
  | 'notes.menu.moveTo' | 'notes.menu.current'
  | 'notes.modal.addTitle' | 'notes.modal.editTitle'
  | 'notes.modal.titleLabel' | 'notes.modal.titlePlaceholder'
  | 'notes.modal.contentLabel' | 'notes.modal.contentPlaceholder'
  | 'notes.modal.folderLabel'
  | 'notes.modal.markImportant' | 'notes.modal.markedImportant'
  | 'notes.modal.save' | 'notes.modal.cancel'
  | 'notes.modal.viewTitle' | 'notes.modal.close' | 'notes.modal.edit'
  | 'notes.star.mark' | 'notes.star.remove'
  | 'notes.deleteConfirm.title' | 'notes.deleteConfirm.body'
  | 'notes.deleteConfirm.confirm' | 'notes.deleteConfirm.cancel'
  | 'notes.error.title' | 'notes.error.content'
  | 'notes.folder.personal' | 'notes.folder.school' | 'notes.folder.work'
  | 'notes.folder.home' | 'notes.folder.ideas' | 'notes.folder.diary'
  // ── Note folders ──────────────────────────────────────────────────────────
  | 'folder.personal' | 'folder.school' | 'folder.work' | 'folder.home' | 'folder.ideas'
  // ── Habits page ───────────────────────────────────────────────────────────
  | 'habits.title' | 'habits.subtitle' | 'habits.add'
  | 'habits.filter.all' | 'habits.filter.active' | 'habits.filter.paused' | 'habits.filter.done'
  | 'habits.empty.title' | 'habits.empty.body'
  | 'habits.status.active' | 'habits.status.paused' | 'habits.status.done'
  | 'habits.streak.days' | 'habits.streak.paused'
  | 'habits.menu.markDone' | 'habits.menu.cancelToday' | 'habits.menu.edit'
  | 'habits.menu.pause' | 'habits.menu.resume' | 'habits.menu.delete'
  | 'habits.overview.title' | 'habits.streak.title'
  | 'habits.breakdown.title' | 'habits.breakdown.active'
  | 'habits.breakdown.paused' | 'habits.breakdown.done'
  | 'habits.manage' | 'habits.ai.title' | 'habits.ai.body'
  | 'habits.quality.excellent' | 'habits.quality.good' | 'habits.quality.needsWork'
  | 'habits.thisWeek' | 'habits.allAvg' | 'habits.successRate'
  | 'habits.modal.addTitle' | 'habits.modal.editTitle'
  | 'habits.modal.nameLabel' | 'habits.modal.descLabel'
  | 'habits.modal.categoryLabel' | 'habits.modal.iconLabel' | 'habits.modal.colorLabel'
  | 'habits.modal.recurrenceLabel' | 'habits.modal.daily' | 'habits.modal.weekdays'
  | 'habits.modal.custom' | 'habits.modal.daysLabel'
  | 'habits.modal.save' | 'habits.modal.cancel' | 'habits.modal.nameRequired'
  | 'habits.deleteConfirm.title' | 'habits.deleteConfirm.body'
  | 'habits.deleteConfirm.confirm' | 'habits.deleteConfirm.cancel'
  | 'habits.recommend.title' | 'habits.recommend.reason' | 'habits.recommend.tips'
  | 'habits.recommend.openHabit' | 'habits.recommend.close'
  | 'habits.manage.title'
  // ── Habit icon labels ─────────────────────────────────────────────────────
  | 'habitIcon.water' | 'habitIcon.run' | 'habitIcon.reading'
  | 'habitIcon.meditation' | 'habitIcon.food' | 'habitIcon.sleep'
  // ── Goals page ────────────────────────────────────────────────────────────
  | 'goals.title' | 'goals.subtitle' | 'goals.add'
  | 'goals.filter.all' | 'goals.filter.active' | 'goals.filter.paused' | 'goals.filter.done'
  | 'goals.empty.title' | 'goals.empty.body'
  | 'goals.status.active' | 'goals.status.paused' | 'goals.status.done' | 'goals.status.expired'
  | 'goals.menu.edit' | 'goals.menu.pause' | 'goals.menu.resume' | 'goals.menu.delete'
  | 'goals.overview.title' | 'goals.longestStreak.title' | 'goals.upcoming.title'
  | 'goals.ai.title' | 'goals.ai.body' | 'goals.viewRecommendation'
  | 'goals.modal.addTitle' | 'goals.modal.nameLabel' | 'goals.modal.namePlaceholder'
  | 'goals.modal.descLabel' | 'goals.modal.descPlaceholder'
  | 'goals.modal.categoryLabel' | 'goals.modal.deadlineLabel'
  | 'goals.modal.colorLabel' | 'goals.modal.statusLabel'
  | 'goals.modal.stepsLabel' | 'goals.modal.stepsPlaceholder'
  | 'goals.modal.save' | 'goals.modal.cancel' | 'goals.modal.error'
  | 'goals.detail.addStep' | 'goals.detail.steps' | 'goals.detail.stepPlaceholder'
  | 'goals.detail.close' | 'goals.detail.edit' | 'goals.detail.deadline'
  | 'goals.deleteConfirm.title' | 'goals.deleteConfirm.body'
  | 'goals.deleteConfirm.confirm' | 'goals.deleteConfirm.cancel'
  | 'goals.modal.editTitle'
  | 'goals.detail.aiHalf' | 'goals.detail.aiStart' | 'goals.detail.progress'
  | 'goals.detail.stepsTotal' | 'goals.detail.stepsDone' | 'goals.detail.stepsLeft' | 'goals.detail.markDone'
  | 'goals.recommend.title' | 'goals.recommend.close' | 'goals.recommend.edit'
  | 'goals.recommend.reason' | 'goals.recommend.tips'
  | 'goals.descMissing' | 'goals.deadlineUndefined' | 'goals.defaultStep'
  // ── Goal icon labels ──────────────────────────────────────────────────────
  | 'goalIcon.personal' | 'goalIcon.career' | 'goalIcon.learning'
  | 'goalIcon.health' | 'goalIcon.money' | 'goalIcon.home'
  | 'goalIcon.family' | 'goalIcon.travel' | 'goalIcon.reading'
  | 'goalIcon.sport' | 'goalIcon.project' | 'goalIcon.other'
  // ── AI Assistant ──────────────────────────────────────────────────────────
  | 'ai.title' | 'ai.heroTitle' | 'ai.heroSubtitle'
  | 'ai.input.placeholder' | 'ai.input.placeholder2'
  | 'ai.suggestions.title' | 'ai.history.title' | 'ai.history.empty'
  | 'ai.capabilities.title' | 'ai.stats.title'
  | 'ai.menu.rename' | 'ai.menu.pin' | 'ai.menu.unpin' | 'ai.menu.delete'
  | 'ai.chat.empty' | 'ai.newChat'
  | 'ai.quick.planDay' | 'ai.quick.prioritize' | 'ai.quick.analyzeHabits' | 'ai.quick.motivate'
  | 'ai.suggested.plan.title' | 'ai.suggested.plan.desc'
  | 'ai.suggested.prioritize.title' | 'ai.suggested.prioritize.desc'
  | 'ai.suggested.goals.title' | 'ai.suggested.goals.desc'
  | 'ai.suggested.habits.title' | 'ai.suggested.habits.desc'
  | 'ai.cap.smart.title' | 'ai.cap.smart.desc'
  | 'ai.cap.plan.title' | 'ai.cap.plan.desc'
  | 'ai.cap.analysis.title' | 'ai.cap.analysis.desc'
  | 'ai.cap.motivation.title' | 'ai.cap.motivation.desc'
  | 'ai.stat.chats' | 'ai.stat.tasks' | 'ai.stat.goals'
  | 'ai.chat.today' | 'ai.chat.yesterday'
  | 'ai.error.loading' | 'ai.error.noReply'
  // ── Calendar ──────────────────────────────────────────────────────────────
  | 'cal.today' | 'cal.new' | 'cal.newEvent' | 'cal.newCalendar'
  | 'cal.view.month' | 'cal.view.week' | 'cal.view.day' | 'cal.view.agenda'
  | 'cal.mine' | 'cal.school' | 'cal.work' | 'cal.family' | 'cal.training'
  | 'cal.myCalendars'
  | 'cal.event.title' | 'cal.event.desc' | 'cal.event.location'
  | 'cal.event.date' | 'cal.event.allDay' | 'cal.event.startTime' | 'cal.event.endTime'
  | 'cal.event.calendar' | 'cal.event.recurrence' | 'cal.event.save'
  | 'cal.event.addTitle' | 'cal.event.editTitle'
  | 'cal.event.titlePlaceholder' | 'cal.event.descPlaceholder'
  | 'cal.event.locationPlaceholder'
  | 'cal.event.error.title' | 'cal.event.error.date'
  | 'cal.recur.none' | 'cal.recur.daily' | 'cal.recur.weekly'
  | 'cal.recur.monthly' | 'cal.recur.yearly'
  // ── Notifications page ────────────────────────────────────────────────────
  | 'notif.title' | 'notif.unread' | 'notif.allRead' | 'notif.empty'
  // ── Profile page ─────────────────────────────────────────────────────────
  | 'profile.notFound' | 'profile.loadError' | 'profile.back'
  | 'profile.saving' | 'profile.saved' | 'profile.saveWarning' | 'profile.saveError'
  | 'profile.photoSaved' | 'profile.photoRemoved' | 'profile.photoWarning'
  | 'profile.confirmDiscard' | 'profile.closeAlert'
  // ── Help page ─────────────────────────────────────────────────────────────
  | 'help.title' | 'help.comingSoon'
  // ── Settings shared ───────────────────────────────────────────────────────
  | 'settings.back' | 'settings.save' | 'settings.saved' | 'settings.saving'
  // ── Notifications settings ────────────────────────────────────────────────
  | 'notifSettings.title' | 'notifSettings.subtitle'
  | 'notifSettings.modules.title' | 'notifSettings.modules.desc'
  | 'notifSettings.channels.title' | 'notifSettings.channels.desc'
  | 'notifSettings.inApp.label' | 'notifSettings.inApp.desc'
  | 'notifSettings.system.label' | 'notifSettings.system.desc'
  | 'notifSettings.reminder.title' | 'notifSettings.reminder.desc' | 'notifSettings.reminder.label'
  | 'notifSettings.quiet.title' | 'notifSettings.quiet.desc'
  | 'notifSettings.quiet.label' | 'notifSettings.quiet.from' | 'notifSettings.quiet.to'
  | 'notifSettings.test' | 'notifSettings.mod.tasks.label' | 'notifSettings.mod.tasks.desc'
  | 'notifSettings.mod.calendar.label' | 'notifSettings.mod.calendar.desc'
  | 'notifSettings.mod.habits.label' | 'notifSettings.mod.habits.desc'
  | 'notifSettings.mod.goals.label' | 'notifSettings.mod.goals.desc'
  | 'notifSettings.mod.school.label' | 'notifSettings.mod.school.desc'
  | 'notifSettings.mod.assistant.label' | 'notifSettings.mod.assistant.desc'
  | 'notifSettings.error.browserNotSupport' | 'notifSettings.error.blocked'
  | 'notifSettings.error.permission'
  // ── DateTime settings ─────────────────────────────────────────────────────
  | 'dt.title' | 'dt.subtitle'
  | 'dt.tz.title' | 'dt.tz.desc' | 'dt.tz.auto' | 'dt.tz.detected'
  | 'dt.tz.manual' | 'dt.tz.label'
  | 'dt.firstDay.title' | 'dt.firstDay.desc' | 'dt.firstDay.monday' | 'dt.firstDay.sunday'
  | 'dt.timeFormat.title' | 'dt.timeFormat.desc' | 'dt.timeFormat.24h' | 'dt.timeFormat.12h'
  | 'dt.dateFormat.title' | 'dt.dateFormat.desc'
  | 'dt.preview.title' | 'dt.preview.desc'
  | 'dt.preview.weekday' | 'dt.preview.date' | 'dt.preview.time'
  // ── Language settings ─────────────────────────────────────────────────────
  | 'lang.title' | 'lang.subtitle'
  | 'lang.app.title' | 'lang.app.desc'
  | 'lang.app.et' | 'lang.app.etSub' | 'lang.app.en' | 'lang.app.enSub'
  | 'lang.ai.title' | 'lang.ai.desc'
  | 'lang.ai.same' | 'lang.ai.sameSub' | 'lang.ai.et' | 'lang.ai.en'
  | 'lang.preview.title' | 'lang.preview.desc' | 'lang.preview.note'
  // ── Security settings ─────────────────────────────────────────────────────
  | 'sec.title' | 'sec.subtitle'
  | 'sec.pw.title' | 'sec.pw.desc' | 'sec.pw.notAvailable'
  | 'sec.pw.current' | 'sec.pw.new' | 'sec.pw.confirm'
  | 'sec.pw.save' | 'sec.pw.saving'
  | 'sec.pw.error.min' | 'sec.pw.error.mismatch'
  | 'sec.pw.error.wrong' | 'sec.pw.error.tooMany' | 'sec.pw.error.failed'
  | 'sec.pw.success'
  | 'sec.email.title' | 'sec.email.desc'
  | 'sec.email.verified' | 'sec.email.notVerified'
  | 'sec.email.resend' | 'sec.email.resending'
  | 'sec.email.success' | 'sec.email.error'
  | 'sec.signout.title' | 'sec.signout.desc'
  | 'sec.signout.confirm' | 'sec.signout.button' | 'sec.signout.cancel'
  // ── School page ───────────────────────────────────────────────────────────
  | 'school.title' | 'school.stat.subjects' | 'school.stat.subjectsSub'
  | 'school.stat.tasks' | 'school.stat.tasksSub'
  | 'school.stat.exams' | 'school.stat.examsSub'
  | 'school.stat.time' | 'school.stat.timeSub'
  | 'school.stat.progress' | 'school.stat.progressSub'
  | 'school.empty.subjects' | 'school.action.open'
  | 'school.action.edit' | 'school.action.delete'
  | 'school.widget.tasks' | 'school.widget.exams' | 'school.widget.allExams'
  | 'school.widget.subjects' | 'school.widget.stats'
  | 'school.form.namePlaceholder' | 'school.form.notesPlaceholder'
  | 'cal.allDay' | 'cal.noEvents' | 'cal.openDay' | 'cal.noEventsDay'
  | 'tasks.detail.markDone' | 'tasks.detail.markActive'
  | 'tasks.status.done' | 'tasks.status.active'
  | 'social.google'
  | 'habits.modal.namePlaceholder' | 'habits.modal.descPlaceholder'
  | 'habits.modal.goalLabel' | 'habits.manage.empty'
  | 'habits.recommend.weekFilled' | 'habits.recommend.noHabits'
  | 'habits.icon.water' | 'habits.icon.run' | 'habits.icon.reading'
  | 'habits.icon.meditation' | 'habits.icon.food' | 'habits.icon.sleep'
  | 'habits.cat.personal' | 'habits.cat.health' | 'habits.cat.work' | 'habits.cat.school'
  | 'ai.time.today' | 'ai.time.yesterday'
  | 'ai.chat.startPrompt'
  | 'school.action.save' | 'school.action.cancel' | 'school.action.discard' | 'school.action.close'
  | 'school.action.addSubject' | 'school.action.addTask' | 'school.action.addTest' | 'school.action.addExam'
  | 'school.action.markDone' | 'school.action.markUndone'
  | 'school.action.openMoodle' | 'school.action.viewAll' | 'school.action.viewLess'
  | 'school.status.done' | 'school.status.undone' | 'school.status.all' | 'school.status.overdue'
  | 'school.empty.tasks' | 'school.empty.tests' | 'school.empty.exams' | 'school.empty.schedule'
  | 'school.modal.subjectData' | 'school.modal.testData' | 'school.modal.taskData'
  | 'school.modal.editTask' | 'school.modal.addTask' | 'school.modal.mySubjects'
  | 'school.sort.deadline' | 'school.filter.allSubjects'
  | 'school.tab.tunniplaan' | 'school.tab.uesanded' | 'school.tab.kontrolltood'
  | 'school.tab.eksamid' | 'school.tab.ained' | 'school.tab.ulevaade'
  // ── TeavitusedPage (Settings > Notifications) ────────────────────────────
  | 'teavit.mod.tasks' | 'teavit.mod.tasks.desc'
  | 'teavit.mod.calendar' | 'teavit.mod.calendar.desc'
  | 'teavit.mod.habits' | 'teavit.mod.habits.desc'
  | 'teavit.mod.goals' | 'teavit.mod.goals.desc'
  | 'teavit.mod.school' | 'teavit.mod.school.desc'
  | 'teavit.mod.ai' | 'teavit.mod.ai.desc'
  | 'teavit.err.noSupport' | 'teavit.err.blocked' | 'teavit.err.noPermission'
  | 'teavit.err.saveFailed'
  | 'teavit.test.body' | 'teavit.test.sent' | 'teavit.test.inApp' | 'teavit.test.noChannel'
  | 'teavit.save' | 'teavit.saved'
  // ── KuupaevJaAegPage extra sublabels ─────────────────────────────────────
  | 'dt.firstDay.mondaySub'
  | 'dt.timeFormat.24hSub' | 'dt.timeFormat.12hSub'
  | 'dt.dateFormat.dmy' | 'dt.dateFormat.iso' | 'dt.dateFormat.dmy2'
  | 'dt.preview.tz'
  // ── TurvalisusPage ────────────────────────────────────────────────────────
  | 'sec.pw.placeholder.current' | 'sec.pw.placeholder.new' | 'sec.pw.placeholder.confirm'
  | 'sec.pw.social'
  | 'sec.2fa.title' | 'sec.2fa.desc' | 'sec.2fa.body' | 'sec.2fa.soon' | 'sec.2fa.badge'
  // ── GoalsPage extra ───────────────────────────────────────────────────────
  | 'goals.detail.descLabel'
  | 'goals.rec.noGoals' | 'goals.rec.noGoals2'
  | 'goals.rec.tip1' | 'goals.rec.tip2' | 'goals.rec.tip3'
  // ── AIAssistantPage ───────────────────────────────────────────────────────
  | 'ai.chat.error' | 'ai.chat.placeholder'
  // ── SchoolPage extra ──────────────────────────────────────────────────────
  | 'school.empty.subjectsTitle'
  | 'school.field.teacher' | 'school.field.room' | 'school.field.subjectName' | 'school.field.color'
  | 'school.field.optional'
  | 'school.section.upcoming'
  | 'school.confirm.irreversible' | 'school.confirm.deleteTask'
  | 'school.empty.tasksWidget' | 'school.empty.testsWidget'
  | 'school.empty.examsWidget' | 'school.empty.scheduleWidget'
  | 'school.stat.tasksDone' | 'school.stat.testsDone'
  | 'school.placeholder.coming'
  | 'school.schedule.none' | 'school.schedule.noneSub'
  | 'school.schedule.titleTraditional' | 'school.schedule.titleElearning'
  | 'school.schedule.openLabel' | 'school.schedule.openLabelNone'
  | 'school.schedule.noTodayTraditional' | 'school.schedule.noTodayElearning'
  | 'school.schedule.upcoming'
  | 'school.studytime.title'
  | 'school.days'
  | 'school.field.examNameLabel' | 'school.field.examDateLabel'
  | 'school.field.examSubjectLabel' | 'school.field.examNotes'
  | 'school.field.examMoodle'
  | 'school.field.testNameLabel' | 'school.field.testDateLabel'
  | 'school.field.testSubjectLabel' | 'school.field.testNotes'
  | 'school.empty.examModal' | 'school.empty.testModal'
  | 'school.subject.placeholder' | 'school.teacher.placeholder' | 'school.room.placeholder'
  | 'school.modal.addExam' | 'school.modal.editExam'
  | 'school.modal.addTest' | 'school.modal.editTest'
  // ── Calendar modal actions ───────────────────────────────────────────────
  | 'cal.action.delete' | 'cal.action.close' | 'cal.action.edit' | 'cal.action.cancel'
  // ── Schedule tab ──────────────────────────────────────────────────────────
  | 'sched.mode.traditional' | 'sched.mode.elearning' | 'sched.mode.none'
  | 'sched.none.title' | 'sched.none.sub' | 'sched.none.enable'
  | 'sched.none.feat1' | 'sched.none.feat2' | 'sched.none.feat3' | 'sched.none.feat4'
  | 'sched.traditional.title' | 'sched.elearning.title'
  | 'sched.add.lesson' | 'sched.add.block'
  | 'sched.empty.title' | 'sched.empty.subLesson' | 'sched.empty.subBlock'
  | 'sched.confirm.delete'
  | 'sched.modal.editLesson' | 'sched.modal.addLesson' | 'sched.modal.addBlock'
  | 'sched.field.subject' | 'sched.field.subjectPh'
  | 'sched.field.day' | 'sched.field.dayPh' | 'sched.field.dayNone'
  | 'sched.field.date' | 'sched.field.datePh'
  | 'sched.field.start' | 'sched.field.end'
  | 'sched.field.room' | 'sched.field.roomPh'
  | 'sched.field.teacher' | 'sched.field.teacherPh'
  | 'sched.field.optional' | 'sched.field.error.subject'
  // ── SchoolPage status/day labels ──────────────────────────────────────────
  | 'school.task.today' | 'school.task.daysLeft' | 'school.task.daysShort'
  | 'school.task.pending' | 'school.task.done'
  | 'school.task.status.tegemata' | 'school.task.status.pooleli' | 'school.task.status.tehtud'
  // ── UlevaadeTab headings ──────────────────────────────────────────────────
  | 'school.uv.title' | 'school.uv.todayTasks' | 'school.uv.avgProgress'
  | 'school.uv.upcomingTests' | 'school.uv.upcomingExams'
  | 'school.uv.subjects' | 'school.uv.subjectsSub' | 'school.uv.openSubjects'
  | 'school.uv.stats' | 'school.uv.statsTime' | 'school.uv.openStats'
  | 'school.uv.openTasks' | 'school.uv.openTests' | 'school.uv.openExams' | 'school.uv.openSchedule'
  // ── School detail modal fields ────────────────────────────────────────────
  | 'school.detail.titleLabel' | 'school.detail.dateLabel'
  | 'school.detail.untilLabel' | 'school.detail.notesLabel'
  | 'school.detail.testLabel' | 'school.detail.examLabel'
  | 'school.detail.pendingLabel' | 'school.detail.doneLabel' | 'school.detail.todayLabel'
  | 'school.detail.dataTitle'
  // ── GoalsPage remaining ───────────────────────────────────────────────────
  | 'goals.color.green' | 'goals.color.purple' | 'goals.color.red'
  | 'goals.color.orange' | 'goals.color.blue' | 'goals.color.yellow'
  | 'goals.segment.active' | 'goals.segment.paused' | 'goals.segment.completed'
  | 'goals.rec.summary' | 'goals.rec.reason'
  | 'goals.rec.goalDefault'
  // ── SchoolPage remaining ──────────────────────────────────────────────────
  | 'school.stat.studyTime' | 'school.stat.studyTimeSub'
  | 'school.filter.allSubjects'
  | 'school.uv.viewAll' | 'school.uv.viewSchedule'
  | 'school.ai.title' | 'school.ai.desc' | 'school.ai.btn'
  | 'school.ai.prompt'
  | 'school.empty.tests' | 'school.empty.testsSub'
  | 'school.task.parts.label' | 'school.task.parts.optional'
  | 'school.task.parts.addPart' | 'school.task.parts.phPart'
  | 'school.task.parts.partN'
  | 'school.modal.editTask' | 'school.modal.addTask2' | 'school.modal.taskData'
  | 'school.field.taskType' | 'school.field.taskTypePh'
  | 'school.field.taskSubject' | 'school.field.taskTopic' | 'school.field.taskTopicPh'
  | 'school.field.taskDeadline' | 'school.field.taskDeadlinePh'
  | 'school.field.taskProgress'
  | 'school.field.examName' | 'school.field.examNamePh'
  | 'school.field.examDeadlinePh'
  | 'school.field.examTimePh' | 'school.field.examTime'
  | 'school.field.examLocation' | 'school.field.examLocationPh'
  | 'school.field.examNotesPh'
  | 'school.confirm.deleteTest' | 'school.confirm.deleteExam' | 'school.confirm.deleteTask'
  | 'school.teacher.prefix'
  | 'school.deadline.prefix'
  | 'school.task.partDefault'
  // ── Dashboard (My Day) ──────────────────────────────────────────────────
  | 'dash.tasks.title' | 'dash.calendar.title' | 'dash.habits.title'
  | 'dash.notes.title' | 'dash.actions.title' | 'dash.goals.title'
  | 'dash.viewAll' | 'dash.viewCalendar' | 'dash.viewNotes'
  | 'dash.tasks.empty' | 'dash.calendar.empty' | 'dash.habits.empty'
  | 'dash.notes.placeholder' | 'dash.notes.recentLabel' | 'dash.notes.emptyHint'
  | 'dash.goals.empty' | 'dash.goals.deadline'
  | 'dash.habits.done' | 'dash.habits.markDone' | 'dash.habits.unmark'
  | 'dash.action.newTask' | 'dash.action.newEvent' | 'dash.action.quickNote' | 'dash.action.timer'
  | 'dash.goal.progress' | 'dash.goal.steps'
  | 'dash.goal.fieldName' | 'dash.goal.fieldDesc' | 'dash.goal.fieldDeadline'
  | 'dash.goal.fieldStatus' | 'dash.goal.placeholder' | 'dash.goal.open' | 'dash.goal.save'
  | 'cal.calendar.mine' | 'cal.calendar.school' | 'cal.calendar.work'
  | 'cal.calendar.family' | 'cal.calendar.training'

  // ── Search ────────────────────────────────────────────────────────────────
  | 'search.placeholder' | 'search.empty' | 'search.hint'
  | 'search.src.tasks' | 'search.src.calendar' | 'search.src.notes'
  | 'search.src.habits' | 'search.src.goals' | 'search.src.assistant'
  | 'search.src.settings' | 'search.src.profile' | 'search.src.files'
  | 'search.src.notifications' | 'search.src.allDay'
  // ── Notifications panel ───────────────────────────────────────────────────
  | 'notif.ariaLabel' | 'notif.newBadge'
  | 'notif.viewAll'
  | 'notif.n1.title' | 'notif.n1.desc' | 'notif.n2.title' | 'notif.n2.desc'
  | 'notif.n3.title' | 'notif.n3.desc' | 'notif.today'


// ── Dictionary ─────────────────────────────────────────────────────────────
const dict: Record<AppLang, Record<TranslationKey, string>> = {
  et: {
    // nav
    'nav.myDay': 'Minu päev', 'nav.tasks': 'Ülesanded', 'nav.calendar': 'Kalender',
    'nav.notes': 'Märkmed', 'nav.habits': 'Harjumused', 'nav.goals': 'Eesmärgid',
    'nav.assistant': 'AI assistent', 'nav.school': 'Kool',
    'nav.help': 'Abi ja tugi', 'nav.settings': 'Seaded',
    'sidebar.darkMode': 'Tume režiim',
    'header.myProfile': 'Minu profiil', 'header.logout': 'Logi välja', 'header.user': 'Kasutaja',
    // settings sections
    'settings.section.account': 'Konto ja profiil', 'settings.section.app': 'Rakenduse seaded',
    'settings.section.data': 'Andmed ja sünkroonimine', 'settings.section.support': 'Tugi ja lisainfo',
    // settings cards
    'settings.card.profile': 'Profiil ja konto', 'settings.card.security': 'Turvalisus',
    'settings.card.email': 'E-posti seaded', 'settings.card.privacy': 'Privaatsus',
    'settings.card.appearance': 'Välimus', 'settings.card.notifications': 'Teavitused',
    'settings.card.datetime': 'Kuupäev ja aeg', 'settings.card.language': 'Keel',
    'settings.card.sync': 'Sünkroonimine', 'settings.card.backup': 'Varundamine',
    'settings.card.export': 'Andmete eksport', 'settings.card.delete': 'Andmete kustutamine',
    'settings.card.helpSupport': 'Abi ja tugi', 'settings.card.whatsNew': 'Mis on uut?',
    'settings.card.feedback': 'Tagasiside', 'settings.card.appInfo': 'Rakenduse info',
    // settings sidebar
    'settings.usage.title': 'Kasutus', 'settings.usage.storage': 'Pilvesalvestus',
    'settings.usage.ai': 'AI päringud', 'settings.usage.projects': 'Projektid',
    'settings.quick.title': 'Kiirtoimingud', 'settings.quick.changePassword': 'Muuda parooli',
    'settings.quick.downloadData': 'Laadi alla andmed', 'settings.quick.checkSync': 'Kontrolli sünkroonimist',
    'settings.quick.contactSupport': 'Võta ühendust toega',
    // public nav
    'pub.nav.features': 'Funktsioonid', 'pub.nav.howItWorks': 'Kuidas see töötab',
    'pub.nav.about': 'Meist', 'pub.nav.login': 'Logi sisse', 'pub.nav.start': 'Alusta tasuta',
    // public footer
    'footer.privacy': 'Privaatsuspoliitika', 'footer.terms': 'Kasutustingimused',
    'footer.contact': 'Kontakt', 'footer.copyright': 'Kõik õigused kaitstud.',
    // shared public
    'pub.backToHome': 'Tagasi avalehele', 'pub.or': 'või',
    // auth shell
    'auth.brandTagline': 'Kõik oluline.\nÜhes kohas.',
    'auth.brandSubtitle': 'Kivora ühendab su ülesanded, kalendri, märkmed, harjumused ja eesmärgid ühte rahulikku ja õhulisse keskkonda.',
    'auth.copyright': 'Kõik õigused kaitstud.',
    // social
    'social.loginWith': 'Logi sisse', 'social.registerWith': 'Registreeru', 'social.loading': 'Laadib…',
    // landing
    'landing.badge': 'Sinu isiklik tootlikkuse keskkond',
    'landing.hero.title': 'Korralda oma päev\nüks lihtne vaade korraga',
    'landing.hero.subtitle': 'Kivora ühendab ülesanded, kalendri, märkmed, harjumused ja eesmärgid ühte rahulikku ja õhulisse keskkonda — nii saad keskenduda sellele, mis loeb.',
    'landing.cta.start': 'Alusta tasuta', 'landing.cta.login': 'Logi sisse',
    'landing.cta.free': 'Tasuta kasutamiseks. Krediitkaarti pole vaja.',
    'landing.features.title': 'Kõik, mida vajad ühes kohas',
    'landing.features.subtitle': 'Lihtne ja rahulik viis oma igapäevase elu haldamiseks.',
    'landing.feat.tasks.title': 'Ülesanded',
    'landing.feat.tasks.desc': 'Planeer ja halda oma päevaseid ülesandeid ühest kohast.',
    'landing.feat.calendar.title': 'Kalender',
    'landing.feat.calendar.desc': 'Hoia sündmused ja tähtajad alati silme ees.',
    'landing.feat.notes.title': 'Märkmed',
    'landing.feat.notes.desc': 'Salvest kiirelt mõtted ja ideed, mis hiljem vajavad tähelepanu.',
    'landing.feat.habits.title': 'Harjumused',
    'landing.feat.habits.desc': 'Ehita järjepidevaid harjumusi ja järgi oma arengut.',
    'landing.feat.goals.title': 'Eesmärgid',
    'landing.feat.goals.desc': 'Sea eesmärke ja jagu need tegevusteks, mis viivad tulemuseni.',
    'landing.feat.ai.title': 'AI assistent',
    'landing.feat.ai.desc': 'Too nutikas abiline oma tootlikkuse haldamiseks.',
    'landing.how.title': 'Lihtne algus', 'landing.how.subtitle': 'Kolm sammu ja oled valmis.',
    'landing.step1.title': 'Loo konto', 'landing.step1.desc': 'Registreeri end tasuta vähem kui minutiga.',
    'landing.step2.title': 'Seadista päev', 'landing.step2.desc': 'Lisa ülesanded, eesmärgid ja harjumused.',
    'landing.step3.title': 'Saavuta rohkem', 'landing.step3.desc': 'Jälgi oma arengut ja hoia fookust.',
    'landing.about.title': 'Meist', 'landing.about.tagline': 'Kõik oluline. Ühes kohas.',
    'landing.about.p1': 'Kivora sündis soovist muuta igapäevaelu lihtsamaks.',
    'landing.about.p2': 'Me usume, et inimesed ei peaks kasutama kümneid erinevaid rakendusi oma elu korraldamiseks. Kalender ühes kohas, ülesanded teises, märkmed kolmandas ja eesmärgid neljandas muudavad igapäeva killustatuks ning võtavad rohkem aega, kui peaks.',
    'landing.about.p3': 'Kivora eesmärk on tuua kõik oluline kokku ühte kohta.',
    'landing.about.quote': 'Üks rakendus. Üks selge vaade. Üks koht, kus saad planeerida oma päeva, hallata ülesandeid, jälgida harjumusi, pidada märkmeid, seada eesmärke ja hoida oma elu korrastatuna.',
    'landing.about.p4': 'Me usume, et tehnoloogia peaks aitama inimest, mitte muutma tema päeva keerulisemaks. Seetõttu keskendume lihtsale, rahulikule ja läbimõeldud kasutuskogemusele, kus iga funktsioon on loodud päriselt väärtust looma.',
    'landing.about.p5': 'Kivora ei ole lihtsalt kalender ega ülesannete nimekiri. See on isiklik produktiivsuskeskus, mis aitab sul näha tervikpilti, keskenduda olulisele ja liikuda samm-sammult oma eesmärkide poole.',
    'landing.principles.title': 'Meie põhimõtted',
    'landing.principle.0': 'Lihtsus. Kõik peab olema arusaadav ja kiiresti kasutatav.',
    'landing.principle.1': 'Selgus. Oluline info on alati esiplaanil.',
    'landing.principle.2': 'Privaatsus. Sinu andmed kuuluvad sulle.',
    'landing.principle.3': 'Usaldusväärsus. Rakendus peab töötama stabiilselt ja ennustatavalt.',
    'landing.principle.4': 'Pidev areng. Kivora areneb koos oma kasutajatega ning muutub paremaks iga uuendusega.',
    'landing.mission.title': 'Meie missioon',
    'landing.mission.text': 'Aidata inimestel kulutada vähem aega erinevate rakenduste vahel liikumisele ja rohkem aega sellele, mis on päriselt oluline.',
    'landing.vision.title': 'Meie visioon',
    'landing.vision.text': 'Luua usaldusväärne ja terviklik platvorm, kus kõik igapäevaelu olulised tegevused on ühendatud ühte lihtsasse, kaasaegsesse ja kasutajasõbralikku rakendusse.',
    'landing.cta2.title': 'Alusta oma teekonda täna',
    'landing.cta2.subtitle': 'Loo konto ja sa oma esimese päeva planeeritud vähem kui minutiga.',
    'landing.finalTagline': 'Kivora. Kõik oluline. Ühes kohas.',
    // login
    'login.title': 'Logi sisse', 'login.subtitle': 'Tere tulemast tagasi.',
    'login.noAccount': 'Sul pole veel kontot? ', 'login.createAccount': 'Loo konto',
    'login.email': 'E-post', 'login.password': 'Parool',
    'login.forgotPassword': 'Unustasid parooli?', 'login.rememberMe': 'Jäta mind meelde',
    'login.submit': 'Logi sisse', 'login.loading': 'Laadib…',
    'login.hidePassword': 'Peida parool', 'login.showPassword': 'Näita parooli',
    'login.emailNotVerified': 'Sinu e-posti aadress pole veel kinnitatud. Palun kinnita see enne sisselogimist.',
    // register
    'reg.title': 'Loo konto', 'reg.subtitle': 'Loo konto ja alusta oma päeva korraldamist.',
    'reg.hasAccount': 'Konto on juba olemas? ', 'reg.login': 'Logi sisse',
    'reg.name': 'Nimi', 'reg.namePlaceholder': 'Mari Kask',
    'reg.email': 'E-post', 'reg.password': 'Parool', 'reg.confirmPassword': 'Parooli kinnitus',
    'reg.agree': 'Nõustun ', 'reg.terms': 'kasutustingimustega', 'reg.and': ' ja ', 'reg.privacy': 'privaatsuspoliitikaga',
    'reg.submit': 'Loo konto', 'reg.loading': 'Laadib…',
    'reg.error.required': 'Kõik väljad peavad olema täidetud.',
    'reg.error.email': 'Vigane e-posti aadress.',
    'reg.error.mismatch': 'Paroolid ei ühti.',
    'reg.error.weak': 'Parool on liiga nõrk. Kasuta vähemalt 8 tähemärki.',
    'reg.error.terms': 'Palun nõustu kasutustingimustega.',
    'reg.success.title': 'Konto loodud',
    'reg.success.subtitle': 'Enne sisselogimist kinnita oma e-posti aadress.',
    'reg.success.body': 'Konto loodi edukalt. Saatsime sinu e-posti aadressile kinnitamise lingi.\nEnne sisselogimist ava see ja kinnita oma e-posti aadress.',
    'reg.success.goLogin': 'Mine sisselogimisele',
    // forgot
    'forgot.title': 'Unustasid parooli?',
    'forgot.subtitle': 'Sisesta oma e-posti aadress. Saadame sulle lingi uue parooli määramiseks.',
    'forgot.submit': 'Saada taastamise link', 'forgot.loading': 'Laadib…',
    'forgot.backToLogin': 'Tagasi sisselogimisse',
    'forgot.error.required': 'Sisesta oma e-posti aadress.',
    'forgot.error.email': 'Vigane e-posti aadress.',
    'forgot.sent.title': 'Kontrolli oma e-posti',
    'forgot.sent.body': 'Parooli taastamise link saadeti sinu e-posti aadressile.',
    // reset
    'reset.checking': 'Kontrollin linki…',
    'reset.expired.title': 'Kinnitamise link on aegunud',
    'reset.expired.body': 'See link on aegunud või vigane. Palun taotle uus parooli taastamise link.',
    'reset.expired.sendNew': 'Saada uus taastamise link',
    'reset.success.title': 'Parool muudetud',
    'reset.success.changed': 'Parool on edukalt muudetud.',
    'reset.success.redirect': 'Suuname sind automaatselt {n} sekundi pärast…',
    'reset.success.goLogin': 'Mine sisselogimisse',
    'reset.form.title': 'Loo uus parool',
    'reset.form.subtitle': 'Sisesta uus parool ja kinnita see.',
    'reset.form.newPassword': 'Uus parool',
    'reset.form.confirmPassword': 'Kinnita uus parool',
    'reset.form.hidePassword': 'Peida parool', 'reset.form.showPassword': 'Näita parooli',
    'reset.submit': 'Salvesta uus parool', 'reset.saving': 'Salvestan…', 'reset.backToLogin': 'Tagasi sisselogimisse',
    'reset.error.length': 'Parool peab olema vähemalt 8 tähemärki pikk.',
    'reset.error.mismatch': 'Paroolid ei ühti.',
    // verify
    'verify.sent.title': 'Kontrolli oma e-posti',
    'verify.sent.text': 'Saatsime sinu e-posti aadressile kinnituskirja. Ava kiri ja vajuta kinnitamise lingile.',
    'verify.verified.title': 'E-post kinnitatud',
    'verify.verified.text': 'Sinu konto on edukalt kinnitatud. Võid nüüd sisse logida.',
    'verify.expired.title': 'Kinnitamise link on aegunud',
    'verify.expired.text': 'Turvalisuse huvides tuleb kinnituskiri uuesti saata.',
    'verify.resend': 'Saada kiri uuesti', 'verify.resending': 'Saadetakse…',
    'verify.checkStatus': 'Kontrolli kinnituse staatust', 'verify.checking': 'Kontrollin…',
    'verify.logout': 'Logi välja', 'verify.backToLogin': 'Tagasi sisselogimisse', 'verify.login': 'Logi sisse',
    // contact
    'contact.title': 'Kontakt', 'contact.subtitle': 'Võta meiega ühendust',
    'contact.desc1': 'Kas sul on küsimusi, ettepanekuid või vajad abi?',
    'contact.desc2': 'Meile on oluline kasutajate tagasiside ja kõik ideed, mis aitavad Kivorat paremaks muuta.',
    'contact.desc3': 'Kui soovid meiega ühendust võtta, täida allolev kontaktivorm. Vastame esimesel võimalusel.',
    'contact.form.name': 'Nimi', 'contact.form.namePlaceholder': 'Sinu nimi',
    'contact.form.email': 'E-posti aadress', 'contact.form.emailPlaceholder': 'sinu@email.ee',
    'contact.form.subject': 'Teema', 'contact.form.subjectPlaceholder': 'Teema',
    'contact.form.message': 'Sõnum', 'contact.form.messagePlaceholder': 'Sinu sõnum',
    'contact.form.submit': 'Saada sõnum', 'contact.form.submitting': 'Saadan…',
    'contact.success': 'Sinu sõnum saadeti edukalt. Vastame esimesel võimalusel.',
    'contact.error': 'Sõnumi saatmine ebaõnnestus. Palun proovi uuesti.',
    'contact.info.title': 'Kontaktandmed',
    'contact.info.website': 'Veebileht: kivora.ee',
    'contact.info.email': 'E-post: Lisatakse enne Kivora avalikku versiooni.',
    'contact.privacy.title': 'Privaatsus',
    'contact.privacy.text': 'Kontaktivormi kaudu saadetud andmeid kasutatakse ainult sinu päringule vastamiseks. Neid ei jagata kolmandatele osapooltele ega kasutata turunduslikel eesmärkidel.',
    'contact.thanks': 'Aitäh, et aitad Kivorat paremaks muuta.',
    // terms / privacy
    'terms.title': 'Kasutustingimused', 'terms.updated': 'Viimati uuendatud: 27.07.2026',
    'privacy.title': 'Privaatsuspoliitika', 'privacy.updated': 'Viimati uuendatud: 27.07.2026',
    // hero
    'hero.morning': 'Tere hommikust', 'hero.afternoon': 'Tere päevast', 'hero.evening': 'Tere õhtust',
    'hero.tasks': 'Ülesanded', 'hero.events': 'Sündmused', 'hero.goals': 'Eesmärgid', 'hero.habits': 'Harjumused',
    // daily messages
    'daily.mon': 'Uus nädal, uued võimalused. Alustame kõige olulisemast.',
    'daily.tue': 'Väikesed sammud viivad suurte tulemusteni.',
    'daily.wed': 'Pool nädalat on tehtud. Jätka samas tempos.',
    'daily.thu': 'Täna on hea päev lõpetada pooleliolevad ülesanded.',
    'daily.fri': 'Nädal hakkab lõppema. Teeme tugeva lõpu.',
    'daily.sat': 'Võta rahulikult ja leia aega ka iseendale.',
    'daily.sun': 'Hea aeg uue nädala planeerimiseks.',
    'daily.default': 'Täna on hea päev oma eesmärkidele lähemale liikuda.',
    // tasks page
    'tasks.title': 'Ülesanded', 'tasks.subtitle': '{active} aktiivset · {done} tehtud',
    'tasks.add': 'Lisa ülesanne',
    'tasks.filter.all': 'Kõik ({n})', 'tasks.filter.active': 'Aktiivsed ({n})', 'tasks.filter.done': 'Tehtud ({n})',
    'tasks.empty.title': 'Ülesandeid pole', 'tasks.empty.body': 'Siia ilmuvad sinu ülesanded.',
    'tasks.progress.title': 'Edenemine',
    'tasks.stat.done': 'Tehtud', 'tasks.stat.active': 'Aktiivsed', 'tasks.stat.total': 'Kokku',
    'tasks.priorities.title': 'Prioriteedid',
    'tasks.priority.high': 'Kõrge', 'tasks.priority.medium': 'Keskmine', 'tasks.priority.low': 'Madal',
    'tasks.ai.title': 'AI soovitus', 'tasks.ai.body': 'Sul on täna 1 kõrge prioriteediga ülesanne ja 2 tänase tähtajaga ülesannet. Soovitan alustada projektiraportist.',
    'tasks.action.edit': 'Muuda', 'tasks.action.delete': 'Kustuta',
    // task modal
    'taskModal.addTitle': 'Lisa ülesanne', 'taskModal.editTitle': 'Muuda ülesannet',
    'taskModal.titleLabel': 'Pealkiri', 'taskModal.titlePlaceholder': 'Ülesande pealkiri',
    'taskModal.descLabel': 'Kirjeldus', 'taskModal.descPlaceholder': 'Valikuline kirjeldus',
    'taskModal.dateLabel': 'Kuupäev', 'taskModal.timeLabel': 'Kellaaeg',
    'taskModal.priorityLabel': 'Prioriteet', 'taskModal.categoryLabel': 'Kategooria',
    'taskModal.save': 'Salvesta', 'taskModal.cancel': 'Tühista',
    'taskModal.error': 'Sisesta ülesande pealkiri.',
    // task categories
    'cat.work': 'Töö', 'cat.school': 'Kool', 'cat.personal': 'Isiklik',
    'cat.family': 'Pere', 'cat.health': 'Tervis', 'cat.shopping': 'Ostud',
    // notes page
    'notes.title': 'Märkmed', 'notes.subtitle': '{n} märget · {f} kausta',
    'notes.add': 'Uus märge', 'notes.searchPlaceholder': 'Otsi märkmetest...', 'notes.all': 'Kõik',
    'notes.empty.title': 'Märkmeid ei leitud', 'notes.empty.body': 'Proovi teist otsusõna või kausta.',
    'notes.overview.title': 'Märkmete ülevaade', 'notes.label': 'märget',
    'notes.folders.title': 'Kaustad', 'notes.ai.title': 'AI soovitus',
    'notes.ai.body': 'Sul on 5 isiklikku märget, mida pole viimase nädala jooksul uuendatud. Soovitan need üle vaadata.',
    'notes.menu.open': 'Ava', 'notes.menu.edit': 'Muuda', 'notes.menu.move': 'Teisalda kausta', 'notes.menu.delete': 'Kustuta',
    'notes.menu.moveTo': 'Teisalda kausta', 'notes.menu.current': 'praegune',
    'notes.modal.addTitle': 'Uus märge', 'notes.modal.editTitle': 'Muuda märget',
    'notes.modal.titleLabel': 'Pealkiri', 'notes.modal.titlePlaceholder': 'Märkme pealkiri',
    'notes.modal.contentLabel': 'Sisu', 'notes.modal.contentPlaceholder': 'Märkme sisu...',
    'notes.modal.folderLabel': 'Kaust/kategooria',
    'notes.modal.markImportant': 'Märgi oluliseks', 'notes.modal.markedImportant': 'Märgitud oluliseks',
    'notes.modal.save': 'Salvesta', 'notes.modal.cancel': 'Tühista',
    'notes.modal.viewTitle': 'Märkme sisu', 'notes.modal.close': 'Sulge', 'notes.modal.edit': 'Muuda',
    'notes.star.mark': 'Märgi oluliseks', 'notes.star.remove': 'Eemalda oluline',
    'notes.deleteConfirm.title': 'Kustuta märge', 'notes.deleteConfirm.body': 'Oled kindel, et soovid selle märkme kustutada?',
    'notes.deleteConfirm.confirm': 'Kustuta', 'notes.deleteConfirm.cancel': 'Tühista',
    'notes.error.title': 'Pealkiri on kohustuslik.', 'notes.error.content': 'Sisu on kohustuslik.',
    'notes.folder.personal': 'Isiklik', 'notes.folder.school': 'Kool', 'notes.folder.work': 'Töö',
    'notes.folder.home': 'Kodu', 'notes.folder.ideas': 'Ideed', 'notes.folder.diary': 'Päevik',
    // folders
    'folder.personal': 'Isiklik', 'folder.school': 'Kool', 'folder.work': 'Töö',
    'folder.home': 'Kodu', 'folder.ideas': 'Ideed',
    // habits page
    'habits.title': 'Harjumused', 'habits.subtitle': '{n} harjumust · {active} aktiivset',
    'habits.add': 'Lisa harjumus',
    'habits.filter.all': 'Kõik ({n})', 'habits.filter.active': 'Aktiivsed ({active})',
    'habits.filter.paused': 'Pausil ({n})', 'habits.filter.done': 'Lõpetatud ({n})',
    'habits.empty.title': 'Harjumusi ei leitud', 'habits.empty.body': 'Proovi teist filtrit või lisa uus harjumus.',
    'habits.status.active': 'Aktiivne', 'habits.status.paused': 'Pausil', 'habits.status.done': 'Lõpetatud',
    'habits.streak.days': 'päeva järjest', 'habits.streak.paused': 'pausil',
    'habits.menu.markDone': 'Märgi tänaseks tehtuks', 'habits.menu.cancelToday': 'Tühista tänane täitmine',
    'habits.menu.edit': 'Muuda', 'habits.menu.pause': 'Pane pausile', 'habits.menu.resume': 'Taasta', 'habits.menu.delete': 'Kustuta',
    'habits.overview.title': 'Ülevaade', 'habits.streak.title': 'Pikim seeria',
    'habits.breakdown.title': 'Harjumused', 'habits.breakdown.active': 'Aktiivsed',
    'habits.breakdown.paused': 'Pausil', 'habits.breakdown.done': 'Lõpetatud',
    'habits.manage': 'Halda harjumusi', 'habits.ai.title': 'AI soovitus', 'habits.ai.body': 'Trenn vajab sel nädalal veidi rohkem tähelepanu.',
    'habits.quality.excellent': 'Suurepärane', 'habits.quality.good': 'Hea', 'habits.quality.needsWork': 'Vajab tööd',
    'habits.thisWeek': 'See nädal', 'habits.allAvg': 'Kõikide harjumuste keskmine', 'habits.successRate': 'edukus',
    'habits.modal.addTitle': 'Lisa harjumus', 'habits.modal.editTitle': 'Muuda harjumust',
    'habits.modal.nameLabel': 'Harjumuse nimi', 'habits.modal.descLabel': 'Kirjeldus',
    'habits.modal.categoryLabel': 'Kategooria', 'habits.modal.iconLabel': 'Ikoon', 'habits.modal.colorLabel': 'Värv',
    'habits.modal.recurrenceLabel': 'Korduvus', 'habits.modal.daily': 'Iga päev', 'habits.modal.weekdays': 'Tööpäevad (E–R)',
    'habits.modal.custom': 'Kohandatud', 'habits.modal.daysLabel': 'Päevad',
    'habits.modal.save': 'Salvesta', 'habits.modal.cancel': 'Tühista', 'habits.modal.nameRequired': 'Harjumuse nimi on kohustuslik.',
    'habits.deleteConfirm.title': 'Kustuta harjumus', 'habits.deleteConfirm.body': 'Oled kindel, et soovid selle harjumuse kustutada?',
    'habits.deleteConfirm.confirm': 'Kustuta', 'habits.deleteConfirm.cancel': 'Tühista',
    'habits.recommend.title': 'AI soovitus', 'habits.recommend.reason': 'Põhjus', 'habits.recommend.tips': 'Näpunäited',
    'habits.recommend.openHabit': 'Muuda harjumust', 'habits.recommend.close': 'Sulge',
    'habits.manage.title': 'Halda harjumusi',
    // habit icons
    'habitIcon.water': 'Vesi', 'habitIcon.run': 'Jooks', 'habitIcon.reading': 'Lugemine',
    'habitIcon.meditation': 'Meditatsioon', 'habitIcon.food': 'Toit', 'habitIcon.sleep': 'Uni',
    // goals page
    'goals.title': 'Eesmärgid', 'goals.subtitle': '{n} eesmärki · {active} aktiivset', 'goals.add': 'Lisa eesmärk',
    'goals.filter.all': 'Kõik ({n})', 'goals.filter.active': 'Aktiivsed ({active})',
    'goals.filter.paused': 'Pausil ({n})', 'goals.filter.done': 'Lõpetatud ({n})',
    'goals.empty.title': 'Eesmärke ei leitud', 'goals.empty.body': 'Proovi teist filtrit või lisa uus eesmärk.',
    'goals.status.active': 'Aktiivne', 'goals.status.paused': 'Pausil', 'goals.status.done': 'Lõpetatud', 'goals.status.expired': 'Aegunud',
    'goals.menu.edit': 'Muuda', 'goals.menu.pause': 'Pane pausile', 'goals.menu.resume': 'Taasta', 'goals.menu.delete': 'Kustuta',
    'goals.overview.title': 'Ülevaade', 'goals.longestStreak.title': 'Pikim seeria', 'goals.upcoming.title': 'Järgmised tähtajad',
    'goals.ai.title': 'AI soovitus', 'goals.ai.body': 'Jätka samas tempos!', 'goals.viewRecommendation': 'Vaata soovitust',
    'goals.modal.addTitle': 'Lisa eesmärk', 'goals.modal.nameLabel': 'Eesmärgi nimi *',
    'goals.modal.namePlaceholder': 'nt Lõpetada raamat', 'goals.modal.descLabel': 'Kirjeldus',
    'goals.modal.descPlaceholder': 'Valikuline kirjeldus', 'goals.modal.categoryLabel': 'Kategooria',
    'goals.modal.deadlineLabel': 'Tähtaeg', 'goals.modal.colorLabel': 'Värv', 'goals.modal.statusLabel': 'Staatus',
    'goals.modal.stepsLabel': 'Sammud', 'goals.modal.stepsPlaceholder': 'Üks samm real',
    'goals.modal.save': 'Lisa eesmärk', 'goals.modal.cancel': 'Tühista', 'goals.modal.error': 'Eesmärgi nimi on kohustuslik',
    'goals.detail.addStep': 'Lisa samm', 'goals.detail.steps': 'Sammud', 'goals.detail.stepPlaceholder': 'Uus samm...',
    'goals.detail.close': 'Sulge', 'goals.detail.edit': 'Muuda', 'goals.detail.deadline': 'Tähtaeg',
    'goals.deleteConfirm.title': 'Kustuta eesmärk', 'goals.deleteConfirm.body': 'Oled kindel, et soovid selle eesmärgi kustutada?',
    'goals.deleteConfirm.confirm': 'Kustuta', 'goals.deleteConfirm.cancel': 'Tühista',
    'goals.recommend.title': 'AI soovitus', 'goals.recommend.close': 'Sulge', 'goals.recommend.edit': 'Muuda eesmärki',
    'goals.modal.editTitle': 'Muuda eesmärki',
    'goals.detail.aiHalf': 'Sa oled üle poole teel! Jätka samas tempos.',
    'goals.detail.aiStart': 'Alusta väikeste sammudega — iga tehtud samm toob sind lähemale.',
    'goals.detail.progress': 'Edenemine',
    'goals.detail.stepsTotal': 'Sammu kokku', 'goals.detail.stepsDone': 'Tehtud', 'goals.detail.stepsLeft': 'Jäänud',
    'goals.detail.markDone': 'Märgi lõpetatuks',
    'goals.recommend.reason': 'Põhjendus', 'goals.recommend.tips': 'Soovitused',
    'goals.descMissing': 'Kirjeldus puudub', 'goals.deadlineUndefined': 'Tähtaeg määramata', 'goals.defaultStep': 'Alustamine',
    // goal icons
    'goalIcon.personal': '👤 Isiklik', 'goalIcon.career': '💼 Karjäär', 'goalIcon.learning': '🎓 Õppimine',
    'goalIcon.health': '❤️ Tervis', 'goalIcon.money': '💰 Raha', 'goalIcon.home': '🏡 Kodu',
    'goalIcon.family': '👨‍👩‍👧 Pere', 'goalIcon.travel': '✈️ Reisimine', 'goalIcon.reading': '📚 Lugemine',
    'goalIcon.sport': '🏆 Sport', 'goalIcon.project': '💡 Projekt', 'goalIcon.other': '🎯 Muu',
    // AI assistant
    'ai.title': 'AI assistent', 'ai.newChat': 'Uus vestlus',
    'ai.heroTitle': 'Kuidas saan täna aidata?',
    'ai.heroSubtitle': 'Kivora AI aitab sul planeerida, analüüsida ja saavutada rohkem.',
    'ai.input.placeholder': 'Kirjuta oma küsimus...', 'ai.input.placeholder2': 'Kirjuta oma küsimus või plaan...',
    'ai.suggestions.title': 'Soovitatud tegevused', 'ai.history.title': 'Hiljutised vestlused',
    'ai.history.empty': 'Vestlusi pole veel. Alusta uut vestlust.',
    'ai.capabilities.title': 'AI võimalused', 'ai.stats.title': 'Sinu statistika',
    'ai.menu.rename': 'Nimeta ümber', 'ai.menu.pin': 'Kinnita',
    'ai.menu.unpin': 'Eemalda kinnitus', 'ai.menu.delete': 'Kustuta',
    'ai.chat.empty': 'Alusta vestlust — esita küsimus või vali kiirtoiming.',
    'ai.quick.planDay': 'Planeeri minu päev', 'ai.quick.prioritize': 'Prioriseeri ülesandeid',
    'ai.quick.analyzeHabits': 'Analüüsi harjumusi', 'ai.quick.motivate': 'Leia motivatsiooni',
    'ai.suggested.plan.title': 'Planeeri nädal', 'ai.suggested.plan.desc': 'Loo mulle plaan järgmiseks nädalaks.',
    'ai.suggested.prioritize.title': 'Prioriseeri ülesanded', 'ai.suggested.prioritize.desc': 'Aita mul valida, mis on täna kõige olulisem.',
    'ai.suggested.goals.title': 'Eesmärkide ülevaade', 'ai.suggested.goals.desc': 'Näita minu aktiivsete eesmärkide kokkuvõtet.',
    'ai.suggested.habits.title': 'Harjumuste analüüs', 'ai.suggested.habits.desc': 'Analüüsi minu harjumuste edenemist.',
    'ai.cap.smart.title': 'Nutikaid soovitusi', 'ai.cap.smart.desc': 'Isikupärastatud soovitused sinu andmete põhjal',
    'ai.cap.plan.title': 'Planeerimise abi', 'ai.cap.plan.desc': 'Päevade, nädalate ja projektide planeerimine',
    'ai.cap.analysis.title': 'Analüüs ja ülevaated', 'ai.cap.analysis.desc': 'Andmete analüüs ja arusaadavad ülevaated',
    'ai.cap.motivation.title': 'Motivatsioon ja tugi', 'ai.cap.motivation.desc': 'Toetus, motivatsioon ja eesmärkide jälgimine',
    'ai.stat.chats': 'Vestlust kokku', 'ai.stat.tasks': 'Ülesannete soovitust', 'ai.stat.goals': 'Eesmärkide analüüsi',
    'ai.chat.today': 'Täna', 'ai.chat.yesterday': 'Eile',
    'ai.error.loading': 'Vabandust, vastuse laadimine ebaõnnestus. Proovi hiljem uuesti.',
    'ai.error.noReply': 'AI ei tagastanud vastust.',
    // calendar
    'cal.today': 'Täna', 'cal.new': 'Uus', 'cal.newEvent': 'Uus sündmus', 'cal.newCalendar': 'Uus kalender',
    'cal.view.month': 'Kuu', 'cal.view.week': 'Nädal', 'cal.view.day': 'Päev', 'cal.view.agenda': 'Nimekiri',
    'cal.mine': 'Minu kalender', 'cal.school': 'Kool', 'cal.work': 'Töö', 'cal.family': 'Perekond', 'cal.training': 'Treening',
    'cal.myCalendars': 'Minu kalendrid',
    'cal.event.title': 'Pealkiri', 'cal.event.desc': 'Kirjeldus', 'cal.event.location': 'Asukoht',
    'cal.event.date': 'Kuupäev', 'cal.event.allDay': 'Terve päeva sündmus',
    'cal.event.startTime': 'Algusaeg', 'cal.event.endTime': 'Lõpuaeg',
    'cal.event.calendar': 'Kalender', 'cal.event.recurrence': 'Korduvus', 'cal.event.save': 'Salvesta',
    'cal.event.addTitle': 'Uus sündmus', 'cal.event.editTitle': 'Muuda sündmust',
    'cal.event.titlePlaceholder': 'Sündmuse pealkiri', 'cal.event.descPlaceholder': 'Lisainfo (valikuline)',
    'cal.event.locationPlaceholder': 'Asukoht (valikuline)',
    'cal.event.error.title': 'Pealkiri on kohustuslik.', 'cal.event.error.date': 'Kuupäev on kohustuslik.',
    'cal.recur.none': 'Ei kordu', 'cal.recur.daily': 'Iga päev', 'cal.recur.weekly': 'Iga nädal',
    'cal.recur.monthly': 'Iga kuu', 'cal.recur.yearly': 'Iga aasta',
    // notifications page
    'notif.title': 'Teavitused', 'notif.unread': '{n} lugemata teavitust',
    'notif.allRead': 'Kõik teavitused loetud', 'notif.empty': 'Uusi teavitusi pole.',
    // profile
    'profile.notFound': 'Profiili ei leitud', 'profile.loadError': 'Profiili laadimine ebaõnnestus',
    'profile.back': 'Tagasi', 'profile.saving': 'Salvestamine ebaõnnestus. Proovi uuesti.',
    'profile.saved': 'Profiil salvestatud',
    'profile.saveWarning': 'Profiiliandmed salvestati, kuid kasutajanime uuendamine vajab uut sisselogimist.',
    'profile.saveError': 'Salvestamine ebaõnnestus. Proovi uuesti.',
    'profile.photoSaved': 'Profiilipilt salvestatud', 'profile.photoRemoved': 'Profiilipilt eemaldatud',
    'profile.photoWarning': 'Pilt salvestati, kuid Headeri uuendamine vajab uut sisselogimist.',
    'profile.confirmDiscard': 'Kas soovid loobuda? Salvestamata muudatused lähevad kaotsi.',
    'profile.closeAlert': 'Sulge teade',
    // help
    'help.title': 'Abi ja tugi', 'help.comingSoon': 'See leht valmib peagi.',
    // settings shared
    'settings.back': 'Tagasi seadetesse', 'settings.save': 'Salvesta', 'settings.saved': 'Salvestatud', 'settings.saving': 'Salvestab…',
    // notifications settings
    'notifSettings.title': 'Teavitused', 'notifSettings.subtitle': 'Halda, millal ja kuidas Kivora sulle teatab.',
    'notifSettings.modules.title': 'Rakenduse teavitused', 'notifSettings.modules.desc': 'Luba teavitused moodulite kaupa',
    'notifSettings.channels.title': 'Teavituse kanalid', 'notifSettings.channels.desc': 'Vali, kuidas teavitusi saad',
    'notifSettings.inApp.label': 'Rakendusesisesed teavitused', 'notifSettings.inApp.desc': 'Teavitused rakenduse sees',
    'notifSettings.system.label': 'Süsteemi märguanded', 'notifSettings.system.desc': 'Brauseri push-teavitused',
    'notifSettings.reminder.title': 'Vaikimisi meeldetuletus', 'notifSettings.reminder.desc': 'Kui kaua enne sündmust meeldetuletus saadetakse',
    'notifSettings.reminder.label': 'Vaikimisi meeldetuletus',
    'notifSettings.quiet.title': 'Vaikne aeg', 'notifSettings.quiet.desc': 'Teavitusi ei saadeta vaikse aja jooksul',
    'notifSettings.quiet.label': 'Luba vaikne aeg', 'notifSettings.quiet.from': 'Algus', 'notifSettings.quiet.to': 'Lõpp',
    'notifSettings.test': 'Saada testteatis',
    'notifSettings.mod.tasks.label': 'Ülesanded', 'notifSettings.mod.tasks.desc': 'Tähtajad ja meeldetuletused',
    'notifSettings.mod.calendar.label': 'Kalender', 'notifSettings.mod.calendar.desc': 'Sündmuste meeldetuletused',
    'notifSettings.mod.habits.label': 'Harjumused', 'notifSettings.mod.habits.desc': 'Igapäevased meeldetuletused',
    'notifSettings.mod.goals.label': 'Eesmärgid', 'notifSettings.mod.goals.desc': 'Edenemise ja tähtaja meeldetuletused',
    'notifSettings.mod.school.label': 'Kool', 'notifSettings.mod.school.desc': 'Kontrolltööd ja ülesannete tähtajad',
    'notifSettings.mod.assistant.label': 'AI assistent', 'notifSettings.mod.assistant.desc': 'Assistendi soovitused ja märguanded',
    'notifSettings.error.browserNotSupport': 'Sinu brauser ei toeta süsteemi märguandeid.',
    'notifSettings.error.blocked': 'Brauser on märguanded blokeerinud. Luba need brauseri seadetes.',
    'notifSettings.error.permission': 'Luba märguanded brauseri seadetes, et neid kasutada.',
    // datetime settings
    'dt.title': 'Kuupäev ja aeg', 'dt.subtitle': 'Vali ajavöönd, nädala alguspäev, kellaajaformaat ja kuupäevaformaat.',
    'dt.tz.title': 'Ajavöönd', 'dt.tz.desc': 'Vali, kuidas rakendus ajavööndit tuvastab',
    'dt.tz.auto': 'Automaatne (soovitatav)', 'dt.tz.detected': 'Tuvastatud: {tz}',
    'dt.tz.manual': 'Käsitsi valimine', 'dt.tz.label': 'Ajavöönd',
    'dt.firstDay.title': 'Nädala alguspäev', 'dt.firstDay.desc': 'Vali, millest nädal algab',
    'dt.firstDay.monday': 'Esmaspäev (soovitatav)', 'dt.firstDay.sunday': 'Pühapäev',
    'dt.timeFormat.title': 'Kellaajaformaat', 'dt.timeFormat.desc': 'Vali, kuidas kelloaega kuvatakse',
    'dt.timeFormat.24h': '24-tunnine (nt 14:30)', 'dt.timeFormat.12h': '12-tunnine (nt 2:30 PM)',
    'dt.dateFormat.title': 'Kuupäevaformaat', 'dt.dateFormat.desc': 'Vali, kuidas kuupäevi kuvatakse',
    'dt.preview.title': 'Eelvaade', 'dt.preview.desc': 'Nii kuvatakse kuupäev ja kellaaeg rakenduses',
    'dt.preview.weekday': 'Nädalapäev', 'dt.preview.date': 'Kuupäev', 'dt.preview.time': 'Kellaaeg',
    // language settings
    'lang.title': 'Keel', 'lang.subtitle': 'Vali rakenduse keel ja tehisintellekti assistendi keel.',
    'lang.app.title': 'Rakenduse keel', 'lang.app.desc': 'Keel, milles kuvatakse rakenduse liides',
    'lang.app.et': 'Eesti', 'lang.app.etSub': 'Eesti keel', 'lang.app.en': 'English', 'lang.app.enSub': 'Inglise keel',
    'lang.ai.title': 'AI assistendi keel', 'lang.ai.desc': 'Keel, milles AI assistent vastab',
    'lang.ai.same': 'Sama mis rakenduse keel', 'lang.ai.sameSub': 'Praegu: Eesti',
    'lang.ai.et': 'Eesti', 'lang.ai.en': 'English',
    'lang.preview.title': 'Eelvaade', 'lang.preview.desc': 'Nii näeb rakendus välja valitud keeles',
    'lang.preview.note': 'Muudatus rakendub kohe pärast salvestamist.',
    // security settings
    'sec.title': 'Turvalisus', 'sec.subtitle': 'Halda oma konto turvaseadeid.',
    'sec.pw.title': 'Muuda parooli', 'sec.pw.desc': 'Uuenda oma sisselogimisparooli',
    'sec.pw.notAvailable': 'Parooliga sisselogimine pole saadaval Google\'iga sisselogitud kontole.',
    'sec.pw.current': 'Praegune parool', 'sec.pw.new': 'Uus parool', 'sec.pw.confirm': 'Kinnita uus parool',
    'sec.pw.save': 'Muuda parooli', 'sec.pw.saving': 'Salvestab…',
    'sec.pw.error.min': 'Uus parool peab olema vähemalt 6 tähemärki.',
    'sec.pw.error.mismatch': 'Uued paroolid ei ühti.', 'sec.pw.error.wrong': 'Praegune parool on vale.',
    'sec.pw.error.tooMany': 'Liiga palju katseid. Proovi hiljem uuesti.',
    'sec.pw.error.failed': 'Parooli muutmine ebaõnnestus. Proovi uuesti.',
    'sec.pw.success': 'Parool edukalt muudetud.',
    'sec.email.title': 'E-posti kinnitamine', 'sec.email.desc': 'Sinu e-posti aadress peab olema kinnitatud',
    'sec.email.verified': 'E-post on kinnitatud', 'sec.email.notVerified': 'E-post pole kinnitatud',
    'sec.email.resend': 'Saada kinnituskiri uuesti', 'sec.email.resending': 'Saadan…',
    'sec.email.success': 'Kinnituskiri saadetud. Kontrolli oma postkasti.',
    'sec.email.error': 'Saatmine ebaõnnestus. Proovi hiljem uuesti.',
    'sec.signout.title': 'Logi välja', 'sec.signout.desc': 'Logi välja kõigist seadmetest',
    'sec.signout.confirm': 'Oled kindel, et soovid välja logida?',
    'sec.signout.button': 'Logi välja', 'sec.signout.cancel': 'Tühista',
    // school
    'school.title': 'Kool',
    'school.stat.subjects': 'Ainet', 'school.stat.subjectsSub': 'Sel õppeperioodil',
    'school.stat.tasks': 'Ülesannet', 'school.stat.tasksSub': 'Tuleb täita',
    'school.stat.exams': 'Kontrolltööd', 'school.stat.examsSub': 'Järgmise 30 päeva jooksul',
    'school.stat.time': 'Õppetöö aeg', 'school.stat.timeSub': 'Sel nädalal',
    'school.stat.progress': 'Edenemine', 'school.stat.progressSub': 'Keskmine',
    'school.empty.subjects': 'Vajuta "Lisa õppeaine", et lisada uus õppeaine.',
    'school.action.open': 'Ava', 'school.action.edit': 'Muuda', 'school.action.delete': 'Kustuta',
    'school.widget.tasks': 'Tänased ülesanded', 'school.widget.exams': 'Lähenevad kontrolltööd',
    'school.widget.allExams': 'Lähenevad eksamid', 'school.widget.subjects': 'Õpitavad ained',
    'school.widget.stats': 'Õppimise statistika', 'school.form.namePlaceholder': 'Nimi (nt OneDrive)',
    'school.form.notesPlaceholder': 'Valikulised märkmed',
    'cal.allDay': 'Kogu päev', 'cal.noEvents': 'Sündmusi ei leitud.',
    'cal.openDay': 'Ava päev', 'cal.noEventsDay': 'Sellel päeval sündmusi ei ole.',
    'habits.modal.namePlaceholder': 'nt. Joo vett', 'habits.modal.descPlaceholder': 'nt. 8 klaasi päevas',
    'habits.modal.goalLabel': 'Eesmärk päevas', 'habits.manage.empty': 'Harjumusi pole.',
    'habits.recommend.weekFilled': 'Täidetud {done} päeval {total}-st.',
    'habits.recommend.noHabits': 'Lisa harjumus, et näha AI soovitust.',
    'habits.icon.water': 'Vesi', 'habits.icon.run': 'Jooks', 'habits.icon.reading': 'Lugemine',
    'habits.icon.meditation': 'Meditatsioon', 'habits.icon.food': 'Toit', 'habits.icon.sleep': 'Uni',
    'habits.cat.personal': 'Isiklik', 'habits.cat.health': 'Tervis', 'habits.cat.work': 'Töö', 'habits.cat.school': 'Kool',
    'ai.time.today': 'Täna', 'ai.time.yesterday': 'Eile',
    'ai.chat.startPrompt': 'Alusta vestlust — esita küsimus või vali kiirtoiming.',
    'school.action.save': 'Salvesta', 'school.action.cancel': 'Tühista', 'school.action.discard': 'Loobu',
    'school.action.close': 'Sulge', 'school.action.addSubject': 'Lisa õppeaine',
    'school.action.addTask': 'Lisa ülesanne', 'school.action.addTest': 'Lisa kontrolltöö', 'school.action.addExam': 'Lisa eksam',
    'school.action.markDone': 'Märgi tehtuks', 'school.action.markUndone': 'Märgi tegemata',
    'school.action.openMoodle': "Ava Moodle'is", 'school.action.viewAll': 'Vaata kõiki', 'school.action.viewLess': 'Näita vähem',
    'school.status.done': 'Tehtud', 'school.status.undone': 'Tegemata', 'school.status.all': 'Kõik', 'school.status.overdue': 'Hilinenud',
    'school.empty.tasks': 'Ülesandeid pole.', 'school.empty.tests': 'Kontrolltöid pole.', 'school.empty.exams': 'Eksameid pole.', 'school.empty.schedule': 'Tunniplaani pole.',
    'school.modal.subjectData': 'Aine andmed', 'school.modal.testData': 'Kontrolltöö andmed', 'school.modal.taskData': 'Ülesande andmed',
    'school.modal.editTask': 'Muuda ülesannet', 'school.modal.addTask': 'Lisa ülesanne', 'school.modal.mySubjects': 'Minu ained',
    'school.sort.deadline': 'Tähtaeg', 'school.filter.allSubjects': 'Kõik ained',
    'tasks.detail.markDone': 'Märgi tehtud', 'tasks.detail.markActive': 'Märgi aktiivseks',
    'tasks.status.done': '✓ Tehtud', 'tasks.status.active': 'Aktiivne',
    // ── Dashboard (My Day)
    'dash.tasks.title': 'Tänased ülesanded', 'dash.calendar.title': 'Kalender',
    'dash.habits.title': 'Harjumused', 'dash.notes.title': 'Kiire märge',
    'dash.actions.title': 'Kiired tegevused', 'dash.goals.title': 'Eesmärgid',
    'dash.viewAll': 'Vaata kõiki', 'dash.viewCalendar': 'Vaata kalendrit', 'dash.viewNotes': 'Vaata märkmeid',
    'dash.tasks.empty': 'Täna pole ülesandeid.', 'dash.calendar.empty': 'Tänased sündmused puuduvad',
    'dash.habits.empty': 'Aktiivseid harjumusi pole.',
    'dash.notes.placeholder': 'Kirjuta kiire märge...', 'dash.notes.recentLabel': 'Viimased märkmed',
    'dash.notes.emptyHint': 'Siia ilmuvad sinu viimased kiired märkmed.',
    'dash.goals.empty': 'Eesmärke pole veel lisatud', 'dash.goals.deadline': 'Tähtaeg',
    'dash.habits.done': 'Täidetud', 'dash.habits.markDone': 'Märgi täidetuks', 'dash.habits.unmark': 'Tühista täitmine',
    'dash.action.newTask': 'Uus ülesanne', 'dash.action.newEvent': 'Uus sündmus',
    'dash.action.quickNote': 'Kiire märge', 'dash.action.timer': 'Alusta taimerit',
    'dash.goal.progress': 'Edenemine', 'dash.goal.steps': 'Sammud',
    'dash.goal.fieldName': 'Nimi', 'dash.goal.fieldDesc': 'Kirjeldus',
    'dash.goal.fieldDeadline': 'Tähtaeg', 'dash.goal.fieldStatus': 'Staatus',
    'dash.goal.placeholder': 'nt 30. detsember 2026',
    'dash.goal.open': 'Ava eesmärgid', 'dash.goal.save': 'Salvesta',
    'cal.calendar.mine': 'Minu kalender', 'cal.calendar.school': 'Kool',
    'cal.calendar.work': 'Töö', 'cal.calendar.family': 'Perekond', 'cal.calendar.training': 'Treening',
        // ── Search
    'search.placeholder': 'Otsi ülesandeid, sündmusi, märkmeid, harjumusi, eesmärke...',
    'search.empty': 'Vasteid ei leitud.', 'search.hint': 'Otsib moodulitest',
    'search.src.tasks': 'Ülesanded', 'search.src.calendar': 'Kalender',
    'search.src.notes': 'Märkmed', 'search.src.habits': 'Harjumused',
    'search.src.goals': 'Eesmärgid', 'search.src.assistant': 'AI assistent',
    'search.src.settings': 'Seaded', 'search.src.profile': 'Profiil',
    'search.src.files': 'Failid', 'search.src.notifications': 'Teavitused',
    'search.src.allDay': 'Kogu päev',
    // ── Notifications panel
    'notif.ariaLabel': 'Teavitused',
    'notif.newBadge': '{n} uus',
    'notif.viewAll': 'Vaata kõiki teavitusi',
    'notif.n1.title': 'Ülesanne on peagi tähtajaks',
    'notif.n1.desc': 'Projektiraporti tähtaeg on täna kell 10:00.',
    'notif.n2.title': 'Järgmine sündmus',
    'notif.n2.desc': 'Projektikoosolek algab kell 14:30.',
    'notif.n3.title': 'Harjumuse meeldetuletus',
    'notif.n3.desc': 'Sul on täna veel kaks harjumust täitmata.',
    'notif.today': 'Täna',
        'social.google': "Jätka Google'iga",
    // ── GoalsPage remaining
    'goals.color.green': 'Roheline', 'goals.color.purple': 'Lilla', 'goals.color.red': 'Punane',
    'goals.color.orange': 'Oranž', 'goals.color.blue': 'Sinine', 'goals.color.yellow': 'Kollane',
    'goals.segment.active': 'Aktiivsed', 'goals.segment.paused': 'Pausil', 'goals.segment.completed': 'Lõpetatud',
    'goals.rec.summary': '{title} vajab sel nädalal veidi rohkem tähelepanu.',
    'goals.rec.reason': 'Oled saavutanud {pct}% eesmärgist. Jätka samas tempos, et jõuda tähtajaks.',
    'goals.rec.goalDefault': 'Eesmärk',
    // ── SchoolPage remaining
    'school.stat.studyTime': 'Õppetöö aeg', 'school.stat.studyTimeSub': 'Sel nädalal',
    'school.uv.viewAll': 'Vaata kõiki', 'school.uv.viewSchedule': 'Vaata kogu tunniplaani',
    'school.ai.title': 'AI õpiabi',
    'school.ai.desc': 'Kivora AI aitab sul selgitada õppeteemasid, teha kokkuvõtteid, planeerida õppimist ning valmistuda kontrolltöödeks ja eksamiteks.',
    'school.ai.btn': 'Küsi AI abist',
    'school.ai.prompt': 'Millise koolitööga peaksin praegu alustama ja miks?',
    'school.empty.testsSub': 'Vajuta "Lisa kontrolltöö", et lisada uus.',
    'school.task.parts.label': 'Ülesande osad', 'school.task.parts.optional': 'valikuline',
    'school.task.parts.addPart': 'Lisa osa', 'school.task.parts.phPart': 'nt. Loe peatükk läbi',
    'school.task.parts.partN': 'Osa {n}',
    'school.modal.addTask2': 'Lisa ülesanne',
    'school.field.taskType': 'Ülesande tüüp', 'school.field.taskTypePh': 'nt Kodutöö, Essee, Laboriaruanne',
    'school.field.taskSubject': 'Õppeaine', 'school.field.taskTopic': 'Teema', 'school.field.taskTopicPh': 'nt Võrrandid lk 45–48',
    'school.field.taskDeadline': 'Tähtaeg', 'school.field.taskDeadlinePh': 'nt. 4. august 2026',
    'school.field.taskProgress': 'Edenemine (%)',
    'school.field.examName': 'Pealkiri', 'school.field.examNamePh': 'nt Matemaatika kontrolltöö',
    'school.field.examDeadlinePh': 'nt. 4. august 2026',
    'school.field.examTimePh': 'nt 09:00', 'school.field.examTime': 'Kellaaeg',
    'school.field.examLocation': 'Asukoht', 'school.field.examLocationPh': 'nt Ruum 201',
    'school.field.examNotesPh': 'Valikulised märkmed',
    'school.confirm.deleteTest': 'Kas soovid kontrolltöö „{title}" kindlasti kustutada?',
    'school.confirm.deleteExam': 'Kas soovid eksami „{title}" kindlasti kustutada?',
    'school.teacher.prefix': 'Õpetaja: ', 'school.deadline.prefix': 'Tähtaeg: ',
    'school.task.partDefault': 'Osa {n}',
        // ── Calendar modal actions
    'cal.action.delete': 'Kustuta', 'cal.action.close': 'Sulge',
    'cal.action.edit': 'Muuda', 'cal.action.cancel': 'Tühista',
    // ── Schedule tab
    'sched.mode.traditional': 'Tavapärane tunniplaan',
    'sched.mode.elearning': 'E-õpe / paindlik õpe',
    'sched.mode.none': 'Tunniplaani ei kasuta',
    'sched.none.title': 'Sa ei kasuta tunniplaani',
    'sched.none.sub': 'Kivorat saab kasutada ka ilma tunniplaanita.',
    'sched.none.enable': 'Lülita tunniplaan sisse',
    'sched.none.feat1': 'Ülesandeid', 'sched.none.feat2': 'Kontrolltöid',
    'sched.none.feat3': 'Eksameid', 'sched.none.feat4': 'AI Õpiabi',
    'sched.traditional.title': 'Minu tunniplaan', 'sched.elearning.title': 'Õppimisplaan',
    'sched.add.lesson': 'Lisa tund', 'sched.add.block': 'Lisa õppimisblokk',
    'sched.empty.title': 'Kirjed puuduvad',
    'sched.empty.subLesson': 'Lisa oma esimene tund nädalapäeva ja kellaaja järgi.',
    'sched.empty.subBlock': 'Lisa oma esimene õppimisblokk või iseseisva õppimise aeg.',
    'sched.confirm.delete': 'Kustuta see kirje?',
    'sched.modal.editLesson': 'Muuda kirjet', 'sched.modal.addLesson': 'Lisa tund', 'sched.modal.addBlock': 'Lisa õppimisblokk',
    'sched.field.subject': 'Aine või tegevus',
    'sched.field.subjectPh': 'nt Matemaatika, Iseseisev õppimine, Moodle ülesanne või Projektitöö',
    'sched.field.day': 'Nädalapäev', 'sched.field.dayPh': 'Vali päev', 'sched.field.dayNone': 'Pole määratud',
    'sched.field.date': 'Kuupäev', 'sched.field.datePh': 'nt. 4. august 2026',
    'sched.field.start': 'Algus', 'sched.field.end': 'Lõpp',
    'sched.field.room': 'Ruum', 'sched.field.roomPh': 'nt. Ruum 201',
    'sched.field.teacher': 'Õpetaja', 'sched.field.teacherPh': 'nt. M. Tamm',
    'sched.field.optional': 'valikuline', 'sched.field.error.subject': 'Sisesta aine või tegevuse nimi.',
    // ── SchoolPage status/day labels
    'school.task.today': 'Täna',
    'school.task.daysLeft': '{n} päeva', 'school.task.daysShort': '{n} p',
    'school.task.pending': 'Ootel', 'school.task.done': 'Tehtud',
    'school.task.status.tegemata': 'Tegemata', 'school.task.status.pooleli': 'Pooleli', 'school.task.status.tehtud': 'Tehtud',
    // ── UlevaadeTab headings
    'school.uv.title': 'Ülevaade', 'school.uv.todayTasks': 'Tänased ülesanded',
    'school.uv.avgProgress': 'Keskmine edenemine',
    'school.uv.upcomingTests': 'Lähenevad kontrolltööd', 'school.uv.upcomingExams': 'Lähenevad eksamid',
    'school.uv.subjects': 'Õpitavad ained', 'school.uv.subjectsSub': 'aktiivset ainet sel õppeperioodil',
    'school.uv.openSubjects': 'Ava ained', 'school.uv.stats': 'Õppimise statistika',
    'school.uv.statsTime': 'Õppimise aeg sel nädalal', 'school.uv.openStats': 'Ava detailid',
    'school.uv.openTasks': 'Ava ülesanded', 'school.uv.openTests': 'Ava kontrolltööd',
    'school.uv.openExams': 'Ava eksamid', 'school.uv.openSchedule': 'Ava tunniplaan',
    // ── School detail modal fields
    'school.detail.titleLabel': 'Pealkiri', 'school.detail.dateLabel': 'Kuupäev',
    'school.detail.untilLabel': 'Tähtajani', 'school.detail.notesLabel': 'Märkmed',
    'school.detail.testLabel': 'Kontrolltöö', 'school.detail.examLabel': 'Eksam',
    'school.detail.pendingLabel': 'Ootel', 'school.detail.doneLabel': 'Tehtud',
    'school.detail.todayLabel': 'Täna', 'school.detail.dataTitle': 'Kontrolltöö andmed',
        'school.tab.tunniplaan': 'Tunniplaan', 'school.tab.uesanded': 'Ülesanded',
    'school.tab.kontrolltood': 'Kontrolltööd', 'school.tab.eksamid': 'Eksamid',
    'school.tab.ained': 'Ained', 'school.tab.ulevaade': 'Ülevaade',


    // teavit (Settings > Notifications modules)
    'teavit.mod.tasks': 'Ülesanded', 'teavit.mod.tasks.desc': 'Tähtajad ja meeldetuletused',
    'teavit.mod.calendar': 'Kalender', 'teavit.mod.calendar.desc': 'Sündmuste meeldetuletused',
    'teavit.mod.habits': 'Harjumused', 'teavit.mod.habits.desc': 'Igapäevased meeldetuletused',
    'teavit.mod.goals': 'Eesmärgid', 'teavit.mod.goals.desc': 'Edenemise ja tähtaja meeldetuletused',
    'teavit.mod.school': 'Kool', 'teavit.mod.school.desc': 'Kontrolltööd ja ülesannete tähtajad',
    'teavit.mod.ai': 'AI assistent', 'teavit.mod.ai.desc': 'Assistendi soovitused ja märguanded',
    'teavit.err.noSupport': 'Sinu brauser ei toeta süsteemi märguandeid.',
    'teavit.err.blocked': 'Brauser on märguanded blokeerinud. Luba need brauseri seadetes.',
    'teavit.err.noPermission': 'Luba märguanded brauseri seadetes, et neid kasutada.',
    'teavit.err.saveFailed': 'Salvestamine ebaõnnestus. Proovi uuesti.',
    'teavit.test.body': 'Teavitused töötavad. See on testriivi.',
    'teavit.test.sent': 'Süsteemi märguanne saadetud.',
    'teavit.test.inApp': '🔔 Teavitused töötavad! See on testrip.',
    'teavit.test.noChannel': 'Luba vähemalt üks teavituskanal, et teste saata.',
    'teavit.save': 'Salvesta seaded', 'teavit.saved': 'Salvestatud',
    // dt extra sublabels
    'dt.firstDay.mondaySub': 'Vaikimisi Euroopa seade',
    'dt.timeFormat.24hSub': 'Näide: 16:07', 'dt.timeFormat.12hSub': 'Näide: 4:07 PM',
    'dt.dateFormat.dmy': 'Päev.Kuu.Aasta', 'dt.dateFormat.iso': 'Aasta-Kuu-Päev (ISO 8601)', 'dt.dateFormat.dmy2': 'Päev/Kuu/Aasta',
    'dt.preview.tz': 'Ajavöönd',
    // sec extra
    'sec.pw.placeholder.current': 'Sisesta praegune parool',
    'sec.pw.placeholder.new': 'Vähemalt 6 tähemärki',
    'sec.pw.placeholder.confirm': 'Korda uut parooli',
    'sec.pw.social': 'Sinu konto kasutab sotsiaalset sisselogimist. Parooli saab muuta oma identiteedipakkuja juures.',
    'sec.2fa.title': 'Kaheastmeline tuvastus', 'sec.2fa.desc': 'Täiendav turvakiht sinu kontole',
    'sec.2fa.body': 'Kaheastmeline tuvastus lisab sinu kontole täiendava turvakihi.',
    'sec.2fa.soon': 'Funktsioon on peagi saadaval.', 'sec.2fa.badge': 'Peagi',
    // goals extra
    'goals.detail.descLabel': 'Kirjeldus',
    'goals.rec.noGoals': 'Sul ei ole veel aktiivseid eesmärke. Lisa uus eesmärk, et alustada.',
    'goals.rec.noGoals2': 'Aktiivsete eesmärkide puudumine tähendab, et AI ei saa analüüsida sinu edenemist.',
    'goals.rec.tip1': 'Lisa konkreetne ja mõõdetav eesmärk.',
    'goals.rec.tip2': 'Määra realistlik tähtaeg.',
    'goals.rec.tip3': 'Vali eesmärgile sobiv kategooria.',
    // ai extra
    'ai.chat.error': 'Vabandust, vastuse laadimine ebaõnnestus. Proovi hiljem uuesti.',
    'ai.chat.placeholder': 'Kirjuta oma küsimus...',
    // school extra
    'school.empty.subjectsTitle': 'Ained puuduvad',
    'school.field.teacher': 'Õpetaja', 'school.field.room': 'Ruum / õppevorm',
    'school.field.subjectName': 'Aine nimi', 'school.field.color': 'Värv',
    'school.field.optional': '(valikuline)',
    'school.section.upcoming': 'Tulevad ülesanded',
    'school.confirm.irreversible': 'Seda tegevust ei saa tagasi võtta.',
    'school.confirm.deleteTask': 'Kas soovid ülesande „{title}" kindlasti kustutada?',
    'school.empty.tasksWidget': 'Tähtaegadega ülesandeid pole.',
    'school.empty.testsWidget': 'Lähenevaid kontrolltöid pole.',
    'school.empty.examsWidget': 'Lähenevaid eksameid pole.',
    'school.empty.scheduleWidget': 'Tunniplaani ei kasutata.',
    'school.stat.tasksDone': 'Täidetud ülesanded', 'school.stat.testsDone': 'Lõpetatud kontrolltööd',
    'school.placeholder.coming': 'See vaade on tulemas.',
    'school.schedule.none': 'Tunniplaani ei kasutata',
    'school.schedule.noneSub': 'Tunniplaani ei kasutata. Ülejäänud Kooli moodul töötab tavaliselt edasi.',
    'school.schedule.titleTraditional': 'Tänane tunniplaan', 'school.schedule.titleElearning': 'Tänane õppimisplaan',
    'school.schedule.openLabel': 'Ava tunniplaan', 'school.schedule.openLabelNone': 'Seadista tunniplaan',
    'school.schedule.noTodayTraditional': 'Tänasele päevale pole tunde lisatud.',
    'school.schedule.noTodayElearning': 'Tänaseks pole õppimisblokke lisatud.',
    'school.schedule.upcoming': 'Lähenevad kontrolltööd ja eksamid',
    'school.studytime.title': 'Õppetöö aeg nädalas',
    'school.days': 'päeva',
    'school.field.examNameLabel': 'Eksami nimi', 'school.field.examDateLabel': 'Kuupäev',
    'school.field.examSubjectLabel': 'Aine', 'school.field.examNotes': 'Märkmed',
    'school.field.examMoodle': 'Moodle link',
    'school.field.testNameLabel': 'Kontrolltöö nimi', 'school.field.testDateLabel': 'Kuupäev',
    'school.field.testSubjectLabel': 'Aine', 'school.field.testNotes': 'Märkmed',
    'school.empty.examModal': 'Eksameid puuduvad', 'school.empty.testModal': 'Kontrolltöid puuduvad',
    'school.subject.placeholder': 'nt Matemaatika', 'school.teacher.placeholder': 'nt M. Tamm',
    'school.room.placeholder': 'nt Ruum 201 või E-õpe',
    'school.modal.addExam': 'Lisa eksam', 'school.modal.editExam': 'Muuda eksamit',
    'school.modal.addTest': 'Lisa kontrolltöö', 'school.modal.editTest': 'Muuda kontrolltööd',
  },
  en: {
    // nav
    'nav.myDay': 'My Day', 'nav.tasks': 'Tasks', 'nav.calendar': 'Calendar',
    'nav.notes': 'Notes', 'nav.habits': 'Habits', 'nav.goals': 'Goals',
    'nav.assistant': 'AI Assistant', 'nav.school': 'School',
    'nav.help': 'Help & Support', 'nav.settings': 'Settings',
    'sidebar.darkMode': 'Dark mode',
    'header.myProfile': 'My profile', 'header.logout': 'Log out', 'header.user': 'User',
    // settings sections
    'settings.section.account': 'Account & Profile', 'settings.section.app': 'App Settings',
    'settings.section.data': 'Data & Sync', 'settings.section.support': 'Support & Info',
    // settings cards
    'settings.card.profile': 'Profile & Account', 'settings.card.security': 'Security',
    'settings.card.email': 'Email Settings', 'settings.card.privacy': 'Privacy',
    'settings.card.appearance': 'Appearance', 'settings.card.notifications': 'Notifications',
    'settings.card.datetime': 'Date & Time', 'settings.card.language': 'Language',
    'settings.card.sync': 'Sync', 'settings.card.backup': 'Backup',
    'settings.card.export': 'Data Export', 'settings.card.delete': 'Delete Data',
    'settings.card.helpSupport': 'Help & Support', 'settings.card.whatsNew': "What's New?",
    'settings.card.feedback': 'Feedback', 'settings.card.appInfo': 'App Info',
    // settings sidebar
    'settings.usage.title': 'Usage', 'settings.usage.storage': 'Cloud Storage',
    'settings.usage.ai': 'AI Requests', 'settings.usage.projects': 'Projects',
    'settings.quick.title': 'Quick Actions', 'settings.quick.changePassword': 'Change password',
    'settings.quick.downloadData': 'Download data', 'settings.quick.checkSync': 'Check sync status',
    'settings.quick.contactSupport': 'Contact support',
    // public nav
    'pub.nav.features': 'Features', 'pub.nav.howItWorks': 'How it works',
    'pub.nav.about': 'About', 'pub.nav.login': 'Log in', 'pub.nav.start': 'Start for free',
    // public footer
    'footer.privacy': 'Privacy Policy', 'footer.terms': 'Terms of Use',
    'footer.contact': 'Contact', 'footer.copyright': 'All rights reserved.',
    // shared public
    'pub.backToHome': 'Back to home', 'pub.or': 'or',
    // auth shell
    'auth.brandTagline': 'Everything important.\nIn one place.',
    'auth.brandSubtitle': 'Kivora brings your tasks, calendar, notes, habits, and goals into one calm and airy environment.',
    'auth.copyright': 'All rights reserved.',
    // social
    'social.loginWith': 'Log in', 'social.registerWith': 'Sign up', 'social.loading': 'Loading…',
    // landing
    'landing.badge': 'Your personal productivity environment',
    'landing.hero.title': 'Organise your day\none simple view at a time',
    'landing.hero.subtitle': 'Kivora brings together tasks, calendar, notes, habits, and goals into one calm and airy environment — so you can focus on what matters.',
    'landing.cta.start': 'Start for free', 'landing.cta.login': 'Log in',
    'landing.cta.free': 'Free to use. No credit card needed.',
    'landing.features.title': 'Everything you need in one place',
    'landing.features.subtitle': 'A simple, calm way to manage your everyday life.',
    'landing.feat.tasks.title': 'Tasks',
    'landing.feat.tasks.desc': 'Plan and manage your daily tasks from one place.',
    'landing.feat.calendar.title': 'Calendar',
    'landing.feat.calendar.desc': 'Keep events and deadlines always in view.',
    'landing.feat.notes.title': 'Notes',
    'landing.feat.notes.desc': 'Quickly save thoughts and ideas that need attention later.',
    'landing.feat.habits.title': 'Habits',
    'landing.feat.habits.desc': 'Build consistent habits and track your progress.',
    'landing.feat.goals.title': 'Goals',
    'landing.feat.goals.desc': 'Set goals and break them into actions that lead to results.',
    'landing.feat.ai.title': 'AI Assistant',
    'landing.feat.ai.desc': 'Bring a smart helper to manage your productivity.',
    'landing.how.title': 'Simple start', 'landing.how.subtitle': 'Three steps and you are ready.',
    'landing.step1.title': 'Create account', 'landing.step1.desc': 'Sign up for free in less than a minute.',
    'landing.step2.title': 'Set up your day', 'landing.step2.desc': 'Add tasks, goals, and habits.',
    'landing.step3.title': 'Achieve more', 'landing.step3.desc': 'Track your progress and stay focused.',
    'landing.about.title': 'About', 'landing.about.tagline': 'Everything important. In one place.',
    'landing.about.p1': 'Kivora was born from a desire to make everyday life simpler.',
    'landing.about.p2': 'We believe people should not have to use dozens of different apps to organise their life. Calendar in one place, tasks in another, notes in a third, and goals in a fourth makes daily life fragmented and takes more time than it should.',
    'landing.about.p3': "Kivora's goal is to bring everything important together in one place.",
    'landing.about.quote': 'One app. One clear view. One place where you can plan your day, manage tasks, track habits, keep notes, set goals, and keep your life organised.',
    'landing.about.p4': 'We believe technology should help people, not make their day more complicated. That is why we focus on a simple, calm, and thoughtful user experience, where every feature is designed to create real value.',
    'landing.about.p5': 'Kivora is not just a calendar or a task list. It is a personal productivity hub that helps you see the big picture, focus on what matters, and move step by step toward your goals.',
    'landing.principles.title': 'Our values',
    'landing.principle.0': 'Simplicity. Everything must be understandable and quick to use.',
    'landing.principle.1': 'Clarity. Important information is always in the foreground.',
    'landing.principle.2': 'Privacy. Your data belongs to you.',
    'landing.principle.3': 'Reliability. The app must work stably and predictably.',
    'landing.principle.4': 'Continuous improvement. Kivora grows with its users and gets better with every update.',
    'landing.mission.title': 'Our mission',
    'landing.mission.text': 'To help people spend less time switching between different apps and more time on what truly matters.',
    'landing.vision.title': 'Our vision',
    'landing.vision.text': 'To create a reliable and comprehensive platform where all important daily activities are united into one simple, modern, and user-friendly application.',
    'landing.cta2.title': 'Start your journey today',
    'landing.cta2.subtitle': 'Create an account and have your first day planned in less than a minute.',
    'landing.finalTagline': 'Kivora. Everything important. In one place.',
    // login
    'login.title': 'Log in', 'login.subtitle': 'Welcome back.',
    'login.noAccount': "Don't have an account? ", 'login.createAccount': 'Create account',
    'login.email': 'Email', 'login.password': 'Password',
    'login.forgotPassword': 'Forgot password?', 'login.rememberMe': 'Remember me',
    'login.submit': 'Log in', 'login.loading': 'Loading…',
    'login.hidePassword': 'Hide password', 'login.showPassword': 'Show password',
    'login.emailNotVerified': 'Your email address has not been verified yet. Please verify it before logging in.',
    // register
    'reg.title': 'Create account', 'reg.subtitle': 'Create an account and start organising your day.',
    'reg.hasAccount': 'Already have an account? ', 'reg.login': 'Log in',
    'reg.name': 'Name', 'reg.namePlaceholder': 'Your name',
    'reg.email': 'Email', 'reg.password': 'Password', 'reg.confirmPassword': 'Confirm password',
    'reg.agree': 'I agree to the ', 'reg.terms': 'terms of use', 'reg.and': ' and ', 'reg.privacy': 'privacy policy',
    'reg.submit': 'Create account', 'reg.loading': 'Loading…',
    'reg.error.required': 'All fields must be filled in.',
    'reg.error.email': 'Invalid email address.',
    'reg.error.mismatch': 'Passwords do not match.',
    'reg.error.weak': 'Password is too weak. Use at least 8 characters.',
    'reg.error.terms': 'Please agree to the terms of use.',
    'reg.success.title': 'Account created',
    'reg.success.subtitle': 'Please verify your email address before logging in.',
    'reg.success.body': 'Account created successfully. We sent a confirmation link to your email address.\nPlease open it and verify your email address before logging in.',
    'reg.success.goLogin': 'Go to login',
    // forgot
    'forgot.title': 'Forgot password?',
    'forgot.subtitle': 'Enter your email address. We will send you a link to set a new password.',
    'forgot.submit': 'Send reset link', 'forgot.loading': 'Loading…',
    'forgot.backToLogin': 'Back to login',
    'forgot.error.required': 'Please enter your email address.',
    'forgot.error.email': 'Invalid email address.',
    'forgot.sent.title': 'Check your email',
    'forgot.sent.body': 'A password reset link was sent to your email address.',
    // reset
    'reset.checking': 'Verifying link…',
    'reset.expired.title': 'Link has expired',
    'reset.expired.body': 'This link is expired or invalid. Please request a new password reset link.',
    'reset.expired.sendNew': 'Send new reset link',
    'reset.success.title': 'Password changed',
    'reset.success.changed': 'Your password has been changed successfully.',
    'reset.success.redirect': 'Redirecting automatically in {n} seconds…',
    'reset.success.goLogin': 'Go to login',
    'reset.form.title': 'Create new password',
    'reset.form.subtitle': 'Enter a new password and confirm it.',
    'reset.form.newPassword': 'New password',
    'reset.form.confirmPassword': 'Confirm new password',
    'reset.form.hidePassword': 'Hide password', 'reset.form.showPassword': 'Show password',
    'reset.submit': 'Save new password', 'reset.saving': 'Saving…', 'reset.backToLogin': 'Back to login',
    'reset.error.length': 'Password must be at least 8 characters long.',
    'reset.error.mismatch': 'Passwords do not match.',
    // verify
    'verify.sent.title': 'Check your email',
    'verify.sent.text': 'We sent a confirmation email to your address. Open it and click the verification link.',
    'verify.verified.title': 'Email verified',
    'verify.verified.text': 'Your account has been successfully verified. You can now log in.',
    'verify.expired.title': 'Verification link has expired',
    'verify.expired.text': 'For security, the verification email must be resent.',
    'verify.resend': 'Resend email', 'verify.resending': 'Sending…',
    'verify.checkStatus': 'Check verification status', 'verify.checking': 'Checking…',
    'verify.logout': 'Log out', 'verify.backToLogin': 'Back to login', 'verify.login': 'Log in',
    // contact
    'contact.title': 'Contact', 'contact.subtitle': 'Get in touch with us',
    'contact.desc1': 'Do you have questions, suggestions, or need help?',
    'contact.desc2': 'User feedback and ideas that help improve Kivora are important to us.',
    'contact.desc3': 'If you would like to contact us, please fill in the contact form below. We will respond as soon as possible.',
    'contact.form.name': 'Name', 'contact.form.namePlaceholder': 'Your name',
    'contact.form.email': 'Email address', 'contact.form.emailPlaceholder': 'your@email.com',
    'contact.form.subject': 'Subject', 'contact.form.subjectPlaceholder': 'Subject',
    'contact.form.message': 'Message', 'contact.form.messagePlaceholder': 'Your message',
    'contact.form.submit': 'Send message', 'contact.form.submitting': 'Sending…',
    'contact.success': 'Your message was sent successfully. We will respond as soon as possible.',
    'contact.error': 'Failed to send message. Please try again.',
    'contact.info.title': 'Contact information',
    'contact.info.website': 'Website: kivora.ee',
    'contact.info.email': 'Email: To be added before Kivora public release.',
    'contact.privacy.title': 'Privacy',
    'contact.privacy.text': 'Data sent through the contact form is used only to respond to your query. It is not shared with third parties or used for marketing purposes.',
    'contact.thanks': 'Thank you for helping make Kivora better.',
    // terms / privacy
    'terms.title': 'Terms of Use', 'terms.updated': 'Last updated: 27.07.2026',
    'privacy.title': 'Privacy Policy', 'privacy.updated': 'Last updated: 27.07.2026',
    // hero
    'hero.morning': 'Good morning', 'hero.afternoon': 'Good afternoon', 'hero.evening': 'Good evening',
    'hero.tasks': 'Tasks', 'hero.events': 'Events', 'hero.goals': 'Goals', 'hero.habits': 'Habits',
    // daily messages
    'daily.mon': 'New week, new opportunities. Let\'s start with the most important.',
    'daily.tue': 'Small steps lead to big results.',
    'daily.wed': 'Half the week is done. Keep going at the same pace.',
    'daily.thu': 'Today is a good day to finish outstanding tasks.',
    'daily.fri': 'The week is ending. Let\'s finish strong.',
    'daily.sat': 'Take it easy and find time for yourself.',
    'daily.sun': 'A great time to plan the new week.',
    'daily.default': 'Today is a good day to get closer to your goals.',
    // tasks page
    'tasks.title': 'Tasks', 'tasks.subtitle': '{active} active · {done} done',
    'tasks.add': 'Add task',
    'tasks.filter.all': 'All ({n})', 'tasks.filter.active': 'Active ({n})', 'tasks.filter.done': 'Done ({n})',
    'tasks.empty.title': 'No tasks', 'tasks.empty.body': 'Your tasks will appear here.',
    'tasks.progress.title': 'Progress',
    'tasks.stat.done': 'Done', 'tasks.stat.active': 'Active', 'tasks.stat.total': 'Total',
    'tasks.priorities.title': 'Priorities',
    'tasks.priority.high': 'High', 'tasks.priority.medium': 'Medium', 'tasks.priority.low': 'Low',
    'tasks.ai.title': 'AI Suggestion', 'tasks.ai.body': 'You have 1 high-priority task and 2 tasks due today. I suggest starting with the project report.',
    'tasks.action.edit': 'Edit', 'tasks.action.delete': 'Delete',
    // task modal
    'taskModal.addTitle': 'Add task', 'taskModal.editTitle': 'Edit task',
    'taskModal.titleLabel': 'Title', 'taskModal.titlePlaceholder': 'Task title',
    'taskModal.descLabel': 'Description', 'taskModal.descPlaceholder': 'Optional description',
    'taskModal.dateLabel': 'Date', 'taskModal.timeLabel': 'Time',
    'taskModal.priorityLabel': 'Priority', 'taskModal.categoryLabel': 'Category',
    'taskModal.save': 'Save', 'taskModal.cancel': 'Cancel',
    'taskModal.error': 'Please enter a task title.',
    // task categories
    'cat.work': 'Work', 'cat.school': 'School', 'cat.personal': 'Personal',
    'cat.family': 'Family', 'cat.health': 'Health', 'cat.shopping': 'Shopping',
    // notes page
    'notes.title': 'Notes', 'notes.subtitle': '{n} notes · {f} folders',
    'notes.add': 'New note', 'notes.searchPlaceholder': 'Search notes...', 'notes.all': 'All',
    'notes.empty.title': 'No notes found', 'notes.empty.body': 'Try a different search term or folder.',
    'notes.overview.title': 'Notes overview', 'notes.label': 'notes',
    'notes.folders.title': 'Folders', 'notes.ai.title': 'AI Suggestion',
    'notes.ai.body': 'You have 5 personal notes that haven\'t been updated in the past week. I suggest reviewing them.',
    'notes.menu.open': 'Open', 'notes.menu.edit': 'Edit', 'notes.menu.move': 'Move to folder', 'notes.menu.delete': 'Delete',
    'notes.menu.moveTo': 'Move to folder', 'notes.menu.current': 'current',
    'notes.modal.addTitle': 'New note', 'notes.modal.editTitle': 'Edit note',
    'notes.modal.titleLabel': 'Title', 'notes.modal.titlePlaceholder': 'Note title',
    'notes.modal.contentLabel': 'Content', 'notes.modal.contentPlaceholder': 'Note content...',
    'notes.modal.folderLabel': 'Folder / category',
    'notes.modal.markImportant': 'Mark as important', 'notes.modal.markedImportant': 'Marked as important',
    'notes.modal.save': 'Save', 'notes.modal.cancel': 'Cancel',
    'notes.modal.viewTitle': 'Note content', 'notes.modal.close': 'Close', 'notes.modal.edit': 'Edit',
    'notes.star.mark': 'Mark as important', 'notes.star.remove': 'Remove important',
    'notes.deleteConfirm.title': 'Delete note', 'notes.deleteConfirm.body': 'Are you sure you want to delete this note?',
    'notes.deleteConfirm.confirm': 'Delete', 'notes.deleteConfirm.cancel': 'Cancel',
    'notes.error.title': 'Title is required.', 'notes.error.content': 'Content is required.',
    'notes.folder.personal': 'Personal', 'notes.folder.school': 'School', 'notes.folder.work': 'Work',
    'notes.folder.home': 'Home', 'notes.folder.ideas': 'Ideas', 'notes.folder.diary': 'Diary',
    // folders
    'folder.personal': 'Personal', 'folder.school': 'School', 'folder.work': 'Work',
    'folder.home': 'Home', 'folder.ideas': 'Ideas',
    // habits page
    'habits.title': 'Habits', 'habits.subtitle': '{n} habits · {active} active',
    'habits.add': 'Add habit',
    'habits.filter.all': 'All ({n})', 'habits.filter.active': 'Active ({active})',
    'habits.filter.paused': 'Paused ({n})', 'habits.filter.done': 'Completed ({n})',
    'habits.empty.title': 'No habits found', 'habits.empty.body': 'Try a different filter or add a new habit.',
    'habits.status.active': 'Active', 'habits.status.paused': 'Paused', 'habits.status.done': 'Completed',
    'habits.streak.days': 'days in a row', 'habits.streak.paused': 'paused',
    'habits.menu.markDone': 'Mark as done today', 'habits.menu.cancelToday': 'Cancel today\'s completion',
    'habits.menu.edit': 'Edit', 'habits.menu.pause': 'Pause', 'habits.menu.resume': 'Resume', 'habits.menu.delete': 'Delete',
    'habits.overview.title': 'Overview', 'habits.streak.title': 'Longest streak',
    'habits.breakdown.title': 'Habits', 'habits.breakdown.active': 'Active',
    'habits.breakdown.paused': 'Paused', 'habits.breakdown.done': 'Completed',
    'habits.manage': 'Manage habits', 'habits.ai.title': 'AI Suggestion', 'habits.ai.body': 'Training needs a bit more attention this week.',
    'habits.quality.excellent': 'Excellent', 'habits.quality.good': 'Good', 'habits.quality.needsWork': 'Needs work',
    'habits.thisWeek': 'This week', 'habits.allAvg': 'Average of all habits', 'habits.successRate': 'success rate',
    'habits.modal.addTitle': 'Add habit', 'habits.modal.editTitle': 'Edit habit',
    'habits.modal.nameLabel': 'Habit name', 'habits.modal.descLabel': 'Description',
    'habits.modal.categoryLabel': 'Category', 'habits.modal.iconLabel': 'Icon', 'habits.modal.colorLabel': 'Colour',
    'habits.modal.recurrenceLabel': 'Recurrence', 'habits.modal.daily': 'Every day', 'habits.modal.weekdays': 'Weekdays (Mon–Fri)',
    'habits.modal.custom': 'Custom', 'habits.modal.daysLabel': 'Days',
    'habits.modal.save': 'Save', 'habits.modal.cancel': 'Cancel', 'habits.modal.nameRequired': 'Habit name is required.',
    'habits.deleteConfirm.title': 'Delete habit', 'habits.deleteConfirm.body': 'Are you sure you want to delete this habit?',
    'habits.deleteConfirm.confirm': 'Delete', 'habits.deleteConfirm.cancel': 'Cancel',
    'habits.recommend.title': 'AI Suggestion', 'habits.recommend.reason': 'Reason', 'habits.recommend.tips': 'Tips',
    'habits.recommend.openHabit': 'Edit habit', 'habits.recommend.close': 'Close',
    'habits.manage.title': 'Manage habits',
    // habit icons
    'habitIcon.water': 'Water', 'habitIcon.run': 'Running', 'habitIcon.reading': 'Reading',
    'habitIcon.meditation': 'Meditation', 'habitIcon.food': 'Food', 'habitIcon.sleep': 'Sleep',
    // goals page
    'goals.title': 'Goals', 'goals.subtitle': '{n} goals · {active} active', 'goals.add': 'Add goal',
    'goals.filter.all': 'All ({n})', 'goals.filter.active': 'Active ({active})',
    'goals.filter.paused': 'Paused ({n})', 'goals.filter.done': 'Completed ({n})',
    'goals.empty.title': 'No goals found', 'goals.empty.body': 'Try a different filter or add a new goal.',
    'goals.status.active': 'Active', 'goals.status.paused': 'Paused', 'goals.status.done': 'Completed', 'goals.status.expired': 'Expired',
    'goals.menu.edit': 'Edit', 'goals.menu.pause': 'Pause', 'goals.menu.resume': 'Resume', 'goals.menu.delete': 'Delete',
    'goals.overview.title': 'Overview', 'goals.longestStreak.title': 'Top goal', 'goals.upcoming.title': 'Upcoming deadlines',
    'goals.ai.title': 'AI Suggestion', 'goals.ai.body': 'Keep going at the same pace!', 'goals.viewRecommendation': 'View suggestion',
    'goals.modal.addTitle': 'Add goal', 'goals.modal.nameLabel': 'Goal name *',
    'goals.modal.namePlaceholder': 'e.g. Finish a book', 'goals.modal.descLabel': 'Description',
    'goals.modal.descPlaceholder': 'Optional description', 'goals.modal.categoryLabel': 'Category',
    'goals.modal.deadlineLabel': 'Deadline', 'goals.modal.colorLabel': 'Colour', 'goals.modal.statusLabel': 'Status',
    'goals.modal.stepsLabel': 'Steps', 'goals.modal.stepsPlaceholder': 'One step per line',
    'goals.modal.save': 'Add goal', 'goals.modal.cancel': 'Cancel', 'goals.modal.error': 'Goal name is required',
    'goals.detail.addStep': 'Add step', 'goals.detail.steps': 'Steps', 'goals.detail.stepPlaceholder': 'New step...',
    'goals.detail.close': 'Close', 'goals.detail.edit': 'Edit', 'goals.detail.deadline': 'Deadline',
    'goals.deleteConfirm.title': 'Delete goal', 'goals.deleteConfirm.body': 'Are you sure you want to delete this goal?',
    'goals.deleteConfirm.confirm': 'Delete', 'goals.deleteConfirm.cancel': 'Cancel',
    'goals.recommend.title': 'AI Suggestion', 'goals.recommend.close': 'Close', 'goals.recommend.edit': 'Edit goal',
    'goals.modal.editTitle': 'Edit goal',
    'goals.detail.aiHalf': 'You are more than halfway there! Keep up the pace.',
    'goals.detail.aiStart': 'Start with small steps — each completed step brings you closer.',
    'goals.detail.progress': 'Progress',
    'goals.detail.stepsTotal': 'Steps total', 'goals.detail.stepsDone': 'Done', 'goals.detail.stepsLeft': 'Remaining',
    'goals.detail.markDone': 'Mark as completed',
    'goals.recommend.reason': 'Reason', 'goals.recommend.tips': 'Tips',
    'goals.descMissing': 'No description', 'goals.deadlineUndefined': 'No deadline set', 'goals.defaultStep': 'Getting started',
    // goal icons
    'goalIcon.personal': '👤 Personal', 'goalIcon.career': '💼 Career', 'goalIcon.learning': '🎓 Learning',
    'goalIcon.health': '❤️ Health', 'goalIcon.money': '💰 Money', 'goalIcon.home': '🏡 Home',
    'goalIcon.family': '👨‍👩‍👧 Family', 'goalIcon.travel': '✈️ Travel', 'goalIcon.reading': '📚 Reading',
    'goalIcon.sport': '🏆 Sport', 'goalIcon.project': '💡 Project', 'goalIcon.other': '🎯 Other',
    // AI assistant
    'ai.title': 'AI Assistant', 'ai.newChat': 'New conversation',
    'ai.heroTitle': 'How can I help you today?',
    'ai.heroSubtitle': 'Kivora AI helps you plan, analyse, and achieve more.',
    'ai.input.placeholder': 'Type your question...', 'ai.input.placeholder2': 'Type your question or plan...',
    'ai.suggestions.title': 'Suggested actions', 'ai.history.title': 'Recent conversations',
    'ai.history.empty': 'No conversations yet. Start a new one.',
    'ai.capabilities.title': 'AI capabilities', 'ai.stats.title': 'Your stats',
    'ai.menu.rename': 'Rename', 'ai.menu.pin': 'Pin',
    'ai.menu.unpin': 'Unpin', 'ai.menu.delete': 'Delete',
    'ai.chat.empty': 'Start a conversation — ask a question or choose a quick action.',
    'ai.quick.planDay': 'Plan my day', 'ai.quick.prioritize': 'Prioritise tasks',
    'ai.quick.analyzeHabits': 'Analyse habits', 'ai.quick.motivate': 'Find motivation',
    'ai.suggested.plan.title': 'Plan the week', 'ai.suggested.plan.desc': 'Create a plan for the next week.',
    'ai.suggested.prioritize.title': 'Prioritise tasks', 'ai.suggested.prioritize.desc': 'Help me decide what is most important today.',
    'ai.suggested.goals.title': 'Goals overview', 'ai.suggested.goals.desc': 'Show me a summary of my active goals.',
    'ai.suggested.habits.title': 'Habits analysis', 'ai.suggested.habits.desc': 'Analyse my habits progress.',
    'ai.cap.smart.title': 'Smart suggestions', 'ai.cap.smart.desc': 'Personalised recommendations based on your data',
    'ai.cap.plan.title': 'Planning help', 'ai.cap.plan.desc': 'Planning days, weeks, and projects',
    'ai.cap.analysis.title': 'Analysis & insights', 'ai.cap.analysis.desc': 'Data analysis and clear overviews',
    'ai.cap.motivation.title': 'Motivation & support', 'ai.cap.motivation.desc': 'Support, motivation, and goal tracking',
    'ai.stat.chats': 'Total conversations', 'ai.stat.tasks': 'Task suggestions', 'ai.stat.goals': 'Goal analyses',
    'ai.chat.today': 'Today', 'ai.chat.yesterday': 'Yesterday',
    'ai.error.loading': 'Sorry, failed to load a response. Please try again later.',
    'ai.error.noReply': 'AI returned no reply.',
    // calendar
    'cal.today': 'Today', 'cal.new': 'New', 'cal.newEvent': 'New event', 'cal.newCalendar': 'New calendar',
    'cal.view.month': 'Month', 'cal.view.week': 'Week', 'cal.view.day': 'Day', 'cal.view.agenda': 'List',
    'cal.mine': 'My calendar', 'cal.school': 'School', 'cal.work': 'Work', 'cal.family': 'Family', 'cal.training': 'Training',
    'cal.myCalendars': 'My calendars',
    'cal.event.title': 'Title', 'cal.event.desc': 'Description', 'cal.event.location': 'Location',
    'cal.event.date': 'Date', 'cal.event.allDay': 'All-day event',
    'cal.event.startTime': 'Start time', 'cal.event.endTime': 'End time',
    'cal.event.calendar': 'Calendar', 'cal.event.recurrence': 'Recurrence', 'cal.event.save': 'Save',
    'cal.event.addTitle': 'New event', 'cal.event.editTitle': 'Edit event',
    'cal.event.titlePlaceholder': 'Event title', 'cal.event.descPlaceholder': 'Additional info (optional)',
    'cal.event.locationPlaceholder': 'Location (optional)',
    'cal.event.error.title': 'Title is required.', 'cal.event.error.date': 'Date is required.',
    'cal.recur.none': 'Does not repeat', 'cal.recur.daily': 'Every day', 'cal.recur.weekly': 'Every week',
    'cal.recur.monthly': 'Every month', 'cal.recur.yearly': 'Every year',
    // notifications page
    'notif.title': 'Notifications', 'notif.unread': '{n} unread notifications',
    'notif.allRead': 'All notifications read', 'notif.empty': 'No new notifications.',
    // profile
    'profile.notFound': 'Profile not found', 'profile.loadError': 'Failed to load profile',
    'profile.back': 'Back', 'profile.saving': 'Saving failed. Please try again.',
    'profile.saved': 'Profile saved',
    'profile.saveWarning': 'Profile data saved, but updating the username requires a new login.',
    'profile.saveError': 'Saving failed. Please try again.',
    'profile.photoSaved': 'Profile photo saved', 'profile.photoRemoved': 'Profile photo removed',
    'profile.photoWarning': 'Photo saved, but updating the header requires a new login.',
    'profile.confirmDiscard': 'Do you want to discard changes? Unsaved changes will be lost.',
    'profile.closeAlert': 'Close alert',
    // help
    'help.title': 'Help & Support', 'help.comingSoon': 'This page is coming soon.',
    // settings shared
    'settings.back': 'Back to settings', 'settings.save': 'Save', 'settings.saved': 'Saved', 'settings.saving': 'Saving…',
    // notifications settings
    'notifSettings.title': 'Notifications', 'notifSettings.subtitle': 'Manage when and how Kivora notifies you.',
    'notifSettings.modules.title': 'App notifications', 'notifSettings.modules.desc': 'Enable notifications per module',
    'notifSettings.channels.title': 'Notification channels', 'notifSettings.channels.desc': 'Choose how you receive notifications',
    'notifSettings.inApp.label': 'In-app notifications', 'notifSettings.inApp.desc': 'Notifications inside the app',
    'notifSettings.system.label': 'System alerts', 'notifSettings.system.desc': 'Browser push notifications',
    'notifSettings.reminder.title': 'Default reminder', 'notifSettings.reminder.desc': 'How far in advance reminders are sent before an event',
    'notifSettings.reminder.label': 'Default reminder',
    'notifSettings.quiet.title': 'Quiet hours', 'notifSettings.quiet.desc': 'No notifications will be sent during quiet hours',
    'notifSettings.quiet.label': 'Enable quiet hours', 'notifSettings.quiet.from': 'Start', 'notifSettings.quiet.to': 'End',
    'notifSettings.test': 'Send test notification',
    'notifSettings.mod.tasks.label': 'Tasks', 'notifSettings.mod.tasks.desc': 'Deadlines and reminders',
    'notifSettings.mod.calendar.label': 'Calendar', 'notifSettings.mod.calendar.desc': 'Event reminders',
    'notifSettings.mod.habits.label': 'Habits', 'notifSettings.mod.habits.desc': 'Daily reminders',
    'notifSettings.mod.goals.label': 'Goals', 'notifSettings.mod.goals.desc': 'Progress and deadline reminders',
    'notifSettings.mod.school.label': 'School', 'notifSettings.mod.school.desc': 'Tests and assignment deadlines',
    'notifSettings.mod.assistant.label': 'AI Assistant', 'notifSettings.mod.assistant.desc': 'Assistant suggestions and alerts',
    'notifSettings.error.browserNotSupport': 'Your browser does not support system notifications.',
    'notifSettings.error.blocked': 'Browser has blocked notifications. Enable them in browser settings.',
    'notifSettings.error.permission': 'Enable notifications in browser settings to use them.',
    // datetime settings
    'dt.title': 'Date & Time', 'dt.subtitle': 'Choose your time zone, first day of week, time format, and date format.',
    'dt.tz.title': 'Time zone', 'dt.tz.desc': 'Choose how the app detects your time zone',
    'dt.tz.auto': 'Automatic (recommended)', 'dt.tz.detected': 'Detected: {tz}',
    'dt.tz.manual': 'Manual selection', 'dt.tz.label': 'Time zone',
    'dt.firstDay.title': 'First day of week', 'dt.firstDay.desc': 'Choose which day the week starts on',
    'dt.firstDay.monday': 'Monday (recommended)', 'dt.firstDay.sunday': 'Sunday',
    'dt.timeFormat.title': 'Time format', 'dt.timeFormat.desc': 'Choose how time is displayed',
    'dt.timeFormat.24h': '24-hour (e.g. 14:30)', 'dt.timeFormat.12h': '12-hour (e.g. 2:30 PM)',
    'dt.dateFormat.title': 'Date format', 'dt.dateFormat.desc': 'Choose how dates are displayed',
    'dt.preview.title': 'Preview', 'dt.preview.desc': 'This is how date and time will appear in the app',
    'dt.preview.weekday': 'Weekday', 'dt.preview.date': 'Date', 'dt.preview.time': 'Time',
    // language settings
    'lang.title': 'Language', 'lang.subtitle': 'Choose the app language and AI assistant language.',
    'lang.app.title': 'App language', 'lang.app.desc': 'The language in which the app interface is displayed',
    'lang.app.et': 'Eesti', 'lang.app.etSub': 'Estonian', 'lang.app.en': 'English', 'lang.app.enSub': 'English',
    'lang.ai.title': 'AI assistant language', 'lang.ai.desc': 'The language in which the AI assistant responds',
    'lang.ai.same': 'Same as app language', 'lang.ai.sameSub': 'Currently: English',
    'lang.ai.et': 'Eesti', 'lang.ai.en': 'English',
    'lang.preview.title': 'Preview', 'lang.preview.desc': 'This is how the app looks in the selected language',
    'lang.preview.note': 'The change takes effect immediately after saving.',
    // security settings
    'sec.title': 'Security', 'sec.subtitle': 'Manage your account security settings.',
    'sec.pw.title': 'Change password', 'sec.pw.desc': 'Update your login password',
    'sec.pw.notAvailable': 'Password login is not available for accounts signed in with Google.',
    'sec.pw.current': 'Current password', 'sec.pw.new': 'New password', 'sec.pw.confirm': 'Confirm new password',
    'sec.pw.save': 'Change password', 'sec.pw.saving': 'Saving…',
    'sec.pw.error.min': 'New password must be at least 6 characters.',
    'sec.pw.error.mismatch': 'New passwords do not match.', 'sec.pw.error.wrong': 'Current password is incorrect.',
    'sec.pw.error.tooMany': 'Too many attempts. Please try again later.',
    'sec.pw.error.failed': 'Failed to change password. Please try again.',
    'sec.pw.success': 'Password changed successfully.',
    'sec.email.title': 'Email verification', 'sec.email.desc': 'Your email address must be verified',
    'sec.email.verified': 'Email is verified', 'sec.email.notVerified': 'Email not verified',
    'sec.email.resend': 'Resend verification email', 'sec.email.resending': 'Sending…',
    'sec.email.success': 'Verification email sent. Check your inbox.',
    'sec.email.error': 'Sending failed. Please try again later.',
    'sec.signout.title': 'Log out', 'sec.signout.desc': 'Log out of all devices',
    'sec.signout.confirm': 'Are you sure you want to log out?',
    'sec.signout.button': 'Log out', 'sec.signout.cancel': 'Cancel',
    // school
    'school.title': 'School',
    'school.stat.subjects': 'Subjects', 'school.stat.subjectsSub': 'This term',
    'school.stat.tasks': 'Assignments', 'school.stat.tasksSub': 'To complete',
    'school.stat.exams': 'Tests', 'school.stat.examsSub': 'In the next 30 days',
    'school.stat.time': 'Study time', 'school.stat.timeSub': 'This week',
    'school.stat.progress': 'Progress', 'school.stat.progressSub': 'Average',
    'school.empty.subjects': 'Click "Add subject" to add a new subject.',
    'school.action.open': 'Open', 'school.action.edit': 'Edit', 'school.action.delete': 'Delete',
    'school.widget.tasks': 'Today\'s assignments', 'school.widget.exams': 'Upcoming tests',
    'school.widget.allExams': 'Upcoming exams', 'school.widget.subjects': 'Subjects',
    'school.widget.stats': 'Study statistics', 'school.form.namePlaceholder': 'Name (e.g. OneDrive)',
    'school.form.notesPlaceholder': 'Optional notes',
    'cal.allDay': 'All day', 'cal.noEvents': 'No events found.',
    'cal.openDay': 'Open day', 'cal.noEventsDay': 'No events on this day.',
    'habits.modal.namePlaceholder': 'e.g. Drink water', 'habits.modal.descPlaceholder': 'e.g. 8 glasses a day',
    'habits.modal.goalLabel': 'Daily goal', 'habits.manage.empty': 'No habits yet.',
    'habits.recommend.weekFilled': 'Done {done} out of {total} days.',
    'habits.recommend.noHabits': 'Add a habit to see an AI suggestion.',
    'habits.icon.water': 'Water', 'habits.icon.run': 'Run', 'habits.icon.reading': 'Reading',
    'habits.icon.meditation': 'Meditation', 'habits.icon.food': 'Food', 'habits.icon.sleep': 'Sleep',
    'habits.cat.personal': 'Personal', 'habits.cat.health': 'Health', 'habits.cat.work': 'Work', 'habits.cat.school': 'School',
    'ai.time.today': 'Today', 'ai.time.yesterday': 'Yesterday',
    'ai.chat.startPrompt': 'Start a conversation — ask a question or pick a quick action.',
    'school.action.save': 'Save', 'school.action.cancel': 'Cancel', 'school.action.discard': 'Discard',
    'school.action.close': 'Close', 'school.action.addSubject': 'Add subject',
    'school.action.addTask': 'Add task', 'school.action.addTest': 'Add test', 'school.action.addExam': 'Add exam',
    'school.action.markDone': 'Mark done', 'school.action.markUndone': 'Mark undone',
    'school.action.openMoodle': 'Open in Moodle', 'school.action.viewAll': 'View all', 'school.action.viewLess': 'Show less',
    'school.status.done': 'Done', 'school.status.undone': 'Not done', 'school.status.all': 'All', 'school.status.overdue': 'Overdue',
    'school.empty.tasks': 'No tasks.', 'school.empty.tests': 'No tests.', 'school.empty.exams': 'No exams.', 'school.empty.schedule': 'No schedule.',
    'school.modal.subjectData': 'Subject details', 'school.modal.testData': 'Test details', 'school.modal.taskData': 'Task details',
    'school.modal.editTask': 'Edit task', 'school.modal.addTask': 'Add task', 'school.modal.mySubjects': 'My subjects',
    'school.sort.deadline': 'Deadline', 'school.filter.allSubjects': 'All subjects',
    'tasks.detail.markDone': 'Mark done', 'tasks.detail.markActive': 'Mark active',
    'tasks.status.done': '✓ Done', 'tasks.status.active': 'Active',
    // ── Dashboard (My Day)
    'dash.tasks.title': "Today's tasks", 'dash.calendar.title': 'Calendar',
    'dash.habits.title': 'Habits', 'dash.notes.title': 'Quick note',
    'dash.actions.title': 'Quick actions', 'dash.goals.title': 'Goals',
    'dash.viewAll': 'View all', 'dash.viewCalendar': 'View calendar', 'dash.viewNotes': 'View notes',
    'dash.tasks.empty': 'No tasks today.', 'dash.calendar.empty': 'No events today',
    'dash.habits.empty': 'No active habits.',
    'dash.notes.placeholder': 'Write a quick note...', 'dash.notes.recentLabel': 'Recent notes',
    'dash.notes.emptyHint': 'Your latest quick notes will appear here.',
    'dash.goals.empty': 'No goals added yet', 'dash.goals.deadline': 'Deadline',
    'dash.habits.done': 'Done', 'dash.habits.markDone': 'Mark as done', 'dash.habits.unmark': 'Unmark',
    'dash.action.newTask': 'New task', 'dash.action.newEvent': 'New event',
    'dash.action.quickNote': 'Quick note', 'dash.action.timer': 'Start timer',
    'dash.goal.progress': 'Progress', 'dash.goal.steps': 'Steps',
    'dash.goal.fieldName': 'Name', 'dash.goal.fieldDesc': 'Description',
    'dash.goal.fieldDeadline': 'Deadline', 'dash.goal.fieldStatus': 'Status',
    'dash.goal.placeholder': 'e.g. 30 December 2026',
    'dash.goal.open': 'Open goals', 'dash.goal.save': 'Save',
    'cal.calendar.mine': 'My calendar', 'cal.calendar.school': 'School',
    'cal.calendar.work': 'Work', 'cal.calendar.family': 'Family', 'cal.calendar.training': 'Training',
        // ── Search
    'search.placeholder': 'Search tasks, events, notes, habits, goals...',
    'search.empty': 'No results found.', 'search.hint': 'Searching modules',
    'search.src.tasks': 'Tasks', 'search.src.calendar': 'Calendar',
    'search.src.notes': 'Notes', 'search.src.habits': 'Habits',
    'search.src.goals': 'Goals', 'search.src.assistant': 'AI Assistant',
    'search.src.settings': 'Settings', 'search.src.profile': 'Profile',
    'search.src.files': 'Files', 'search.src.notifications': 'Notifications',
    'search.src.allDay': 'All day',
    // ── Notifications panel
    'notif.ariaLabel': 'Notifications',
    'notif.newBadge': '{n} new',
    'notif.viewAll': 'View all notifications',
    'notif.n1.title': 'Task deadline approaching',
    'notif.n1.desc': 'Project report deadline is today at 10:00.',
    'notif.n2.title': 'Upcoming event',
    'notif.n2.desc': 'Project meeting starts at 14:30.',
    'notif.n3.title': 'Habit reminder',
    'notif.n3.desc': 'You still have two habits left to complete today.',
    'notif.today': 'Today',
        'social.google': 'Continue with Google',
    // ── GoalsPage remaining
    'goals.color.green': 'Green', 'goals.color.purple': 'Purple', 'goals.color.red': 'Red',
    'goals.color.orange': 'Orange', 'goals.color.blue': 'Blue', 'goals.color.yellow': 'Yellow',
    'goals.segment.active': 'Active', 'goals.segment.paused': 'Paused', 'goals.segment.completed': 'Completed',
    'goals.rec.summary': '{title} needs a bit more attention this week.',
    'goals.rec.reason': "You've achieved {pct}% of this goal. Keep up the pace to reach the deadline.",
    'goals.rec.goalDefault': 'Goal',
    // ── SchoolPage remaining
    'school.stat.studyTime': 'Study time', 'school.stat.studyTimeSub': 'This week',
    'school.uv.viewAll': 'View all', 'school.uv.viewSchedule': 'View full schedule',
    'school.ai.title': 'AI Study Help',
    'school.ai.desc': 'Kivora AI helps you understand topics, summarise content, plan studying, and prepare for tests and exams.',
    'school.ai.btn': 'Ask AI for help',
    'school.ai.prompt': 'Which schoolwork should I start with right now and why?',
    'school.empty.testsSub': 'Press "Add test" to add one.',
    'school.modal.addTask2': 'Add task',
    'school.task.parts.label': 'Task parts', 'school.task.parts.optional': 'optional',
    'school.task.parts.addPart': 'Add part', 'school.task.parts.phPart': 'e.g. Read chapter',
    'school.task.parts.partN': 'Part {n}',
    'school.field.taskType': 'Task type', 'school.field.taskTypePh': 'e.g. Homework, Essay, Lab report',
    'school.field.taskSubject': 'Subject', 'school.field.taskTopic': 'Topic', 'school.field.taskTopicPh': 'e.g. Equations p. 45–48',
    'school.field.taskDeadline': 'Deadline', 'school.field.taskDeadlinePh': 'e.g. 4 August 2026',
    'school.field.taskProgress': 'Progress (%)',
    'school.field.examName': 'Title', 'school.field.examNamePh': 'e.g. Maths test',
    'school.field.examDeadlinePh': 'e.g. 4 August 2026',
    'school.field.examTimePh': 'e.g. 09:00', 'school.field.examTime': 'Time',
    'school.field.examLocation': 'Location', 'school.field.examLocationPh': 'e.g. Room 201',
    'school.field.examNotesPh': 'Optional notes',
    'school.confirm.deleteTest': 'Are you sure you want to delete test "{title}"?',
    'school.confirm.deleteExam': 'Are you sure you want to delete exam "{title}"?',
    'school.teacher.prefix': 'Teacher: ', 'school.deadline.prefix': 'Deadline: ',
    'school.task.partDefault': 'Part {n}',
    // ── Calendar modal actions
    'cal.action.delete': 'Delete', 'cal.action.close': 'Close',
    'cal.action.edit': 'Edit', 'cal.action.cancel': 'Cancel',
    // ── Schedule tab
    'sched.mode.traditional': 'Traditional schedule',
    'sched.mode.elearning': 'E-learning / flexible',
    'sched.mode.none': 'No schedule',
    'sched.none.title': 'You are not using a schedule',
    'sched.none.sub': 'Kivora works great without a schedule too.',
    'sched.none.enable': 'Enable schedule',
    'sched.none.feat1': 'Tasks', 'sched.none.feat2': 'Tests',
    'sched.none.feat3': 'Exams', 'sched.none.feat4': 'AI Study Help',
    'sched.traditional.title': 'My timetable', 'sched.elearning.title': 'Study plan',
    'sched.add.lesson': 'Add lesson', 'sched.add.block': 'Add study block',
    'sched.empty.title': 'No entries yet',
    'sched.empty.subLesson': 'Add your first lesson by day and time.',
    'sched.empty.subBlock': 'Add your first study block or self-study session.',
    'sched.confirm.delete': 'Delete this entry?',
    'sched.modal.editLesson': 'Edit entry', 'sched.modal.addLesson': 'Add lesson', 'sched.modal.addBlock': 'Add study block',
    'sched.field.subject': 'Subject or activity',
    'sched.field.subjectPh': 'e.g. Maths, Self-study, Moodle task or Project work',
    'sched.field.day': 'Day of week', 'sched.field.dayPh': 'Select day', 'sched.field.dayNone': 'Not set',
    'sched.field.date': 'Date', 'sched.field.datePh': 'e.g. 4 August 2026',
    'sched.field.start': 'Start', 'sched.field.end': 'End',
    'sched.field.room': 'Room', 'sched.field.roomPh': 'e.g. Room 201',
    'sched.field.teacher': 'Teacher', 'sched.field.teacherPh': 'e.g. M. Smith',
    'sched.field.optional': 'optional', 'sched.field.error.subject': 'Please enter a subject or activity name.',
    // ── SchoolPage status/day labels
    'school.task.today': 'Today',
    'school.task.daysLeft': '{n} days', 'school.task.daysShort': '{n} d',
    'school.task.pending': 'Pending', 'school.task.done': 'Done',
    'school.task.status.tegemata': 'To do', 'school.task.status.pooleli': 'In progress', 'school.task.status.tehtud': 'Done',
    // ── UlevaadeTab headings
    'school.uv.title': 'Overview', 'school.uv.todayTasks': "Today's tasks",
    'school.uv.avgProgress': 'Average progress',
    'school.uv.upcomingTests': 'Upcoming tests', 'school.uv.upcomingExams': 'Upcoming exams',
    'school.uv.subjects': 'Subjects studied', 'school.uv.subjectsSub': 'active subjects this period',
    'school.uv.openSubjects': 'Open subjects', 'school.uv.stats': 'Study statistics',
    'school.uv.statsTime': 'Study time this week', 'school.uv.openStats': 'Open details',
    'school.uv.openTasks': 'Open tasks', 'school.uv.openTests': 'Open tests',
    'school.uv.openExams': 'Open exams', 'school.uv.openSchedule': 'Open schedule',
    // ── School detail modal fields
    'school.detail.titleLabel': 'Title', 'school.detail.dateLabel': 'Date',
    'school.detail.untilLabel': 'Until deadline', 'school.detail.notesLabel': 'Notes',
    'school.detail.testLabel': 'Test', 'school.detail.examLabel': 'Exam',
    'school.detail.pendingLabel': 'Pending', 'school.detail.doneLabel': 'Done',
    'school.detail.todayLabel': 'Today', 'school.detail.dataTitle': 'Test data',
        'school.tab.tunniplaan': 'Schedule', 'school.tab.uesanded': 'Tasks',
    'school.tab.kontrolltood': 'Tests', 'school.tab.eksamid': 'Exams',
    'school.tab.ained': 'Subjects', 'school.tab.ulevaade': 'Overview',
    // teavit
    'teavit.mod.tasks': 'Tasks', 'teavit.mod.tasks.desc': 'Deadlines and reminders',
    'teavit.mod.calendar': 'Calendar', 'teavit.mod.calendar.desc': 'Event reminders',
    'teavit.mod.habits': 'Habits', 'teavit.mod.habits.desc': 'Daily reminders',
    'teavit.mod.goals': 'Goals', 'teavit.mod.goals.desc': 'Progress and deadline reminders',
    'teavit.mod.school': 'School', 'teavit.mod.school.desc': 'Tests and assignment deadlines',
    'teavit.mod.ai': 'AI assistant', 'teavit.mod.ai.desc': 'Assistant suggestions and alerts',
    'teavit.err.noSupport': 'Your browser does not support system notifications.',
    'teavit.err.blocked': 'Browser has blocked notifications. Enable them in browser settings.',
    'teavit.err.noPermission': 'Allow notifications in browser settings to use them.',
    'teavit.err.saveFailed': 'Save failed. Please try again.',
    'teavit.test.body': 'Notifications working. This is a test.',
    'teavit.test.sent': 'System notification sent.',
    'teavit.test.inApp': '🔔 Notifications working! This is a test.',
    'teavit.test.noChannel': 'Enable at least one notification channel to send tests.',
    'teavit.save': 'Save settings', 'teavit.saved': 'Saved',
    // dt extra
    'dt.firstDay.mondaySub': 'Default European setting',
    'dt.timeFormat.24hSub': 'Example: 16:07', 'dt.timeFormat.12hSub': 'Example: 4:07 PM',
    'dt.dateFormat.dmy': 'Day.Month.Year', 'dt.dateFormat.iso': 'Year-Month-Day (ISO 8601)', 'dt.dateFormat.dmy2': 'Day/Month/Year',
    'dt.preview.tz': 'Time zone',
    // sec extra
    'sec.pw.placeholder.current': 'Enter current password',
    'sec.pw.placeholder.new': 'At least 6 characters',
    'sec.pw.placeholder.confirm': 'Repeat new password',
    'sec.pw.social': 'Your account uses social sign-in. You can change your password through your identity provider.',
    'sec.2fa.title': 'Two-factor authentication', 'sec.2fa.desc': 'An extra layer of security for your account',
    'sec.2fa.body': 'Two-factor authentication adds an extra layer of security to your account.',
    'sec.2fa.soon': 'This feature is coming soon.', 'sec.2fa.badge': 'Coming soon',
    // goals extra
    'goals.detail.descLabel': 'Description',
    'goals.rec.noGoals': 'You have no active goals yet. Add a new goal to get started.',
    'goals.rec.noGoals2': 'Without active goals, the AI cannot analyse your progress.',
    'goals.rec.tip1': 'Add a specific and measurable goal.',
    'goals.rec.tip2': 'Set a realistic deadline.',
    'goals.rec.tip3': 'Choose a suitable category for your goal.',
    // ai extra
    'ai.chat.error': 'Sorry, failed to load the response. Please try again later.',
    'ai.chat.placeholder': 'Type your question...',
    // school extra
    'school.empty.subjectsTitle': 'No subjects',
    'school.field.teacher': 'Teacher', 'school.field.room': 'Room / format',
    'school.field.subjectName': 'Subject name', 'school.field.color': 'Colour',
    'school.field.optional': '(optional)',
    'school.section.upcoming': 'Upcoming assignments',
    'school.confirm.irreversible': 'This action cannot be undone.',
    'school.confirm.deleteTask': 'Are you sure you want to delete the assignment \"{title}\"?',
    'school.empty.tasksWidget': 'No tasks with deadlines.',
    'school.empty.testsWidget': 'No upcoming tests.',
    'school.empty.examsWidget': 'No upcoming exams.',
    'school.empty.scheduleWidget': 'Schedule not enabled.',
    'school.stat.tasksDone': 'Completed assignments', 'school.stat.testsDone': 'Completed tests',
    'school.placeholder.coming': 'This view is coming soon.',
    'school.schedule.none': 'No schedule',
    'school.schedule.noneSub': 'Schedule is disabled. The rest of the School module works normally.',
    'school.schedule.titleTraditional': 'Today\'s schedule', 'school.schedule.titleElearning': 'Today\'s study plan',
    'school.schedule.openLabel': 'Open schedule', 'school.schedule.openLabelNone': 'Set up schedule',
    'school.schedule.noTodayTraditional': 'No lessons added for today.',
    'school.schedule.noTodayElearning': 'No study blocks added for today.',
    'school.schedule.upcoming': 'Upcoming tests and exams',
    'school.studytime.title': 'Study time per week',
    'school.days': 'days',
    'school.field.examNameLabel': 'Exam name', 'school.field.examDateLabel': 'Date',
    'school.field.examSubjectLabel': 'Subject', 'school.field.examNotes': 'Notes',
    'school.field.examMoodle': 'Moodle link',
    'school.field.testNameLabel': 'Test name', 'school.field.testDateLabel': 'Date',
    'school.field.testSubjectLabel': 'Subject', 'school.field.testNotes': 'Notes',
    'school.empty.examModal': 'No exams', 'school.empty.testModal': 'No tests',
    'school.subject.placeholder': 'e.g. Mathematics', 'school.teacher.placeholder': 'e.g. M. Tamm',
    'school.room.placeholder': 'e.g. Room 201 or E-learning',
    'school.modal.addExam': 'Add exam', 'school.modal.editExam': 'Edit exam',
    'school.modal.addTest': 'Add test', 'school.modal.editTest': 'Edit test',
  },
}

/** Translate a key to the given language. Falls back to Estonian if missing. */
export function t(key: TranslationKey, lang: AppLang): string {
  return dict[lang]?.[key] ?? dict.et[key] ?? key
}
