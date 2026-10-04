export const platforms = [
  {
    id: "ashby_remote_pl",
    hosts: ["jobs.ashbyhq.com"],
    mode: "public_api",
    note: "Пробный ручной сбор с выбранных досок работодателей; только Junior IT, Remote и Poland по полям работодателя.",
  },
  {
    id: "jooble",
    hosts: ["pl.jooble.org"],
    mode: "api",
    note: "Работает; польский ключ, ограниченная квота.",
  },
  {
    id: "justjoin",
    hosts: ["justjoin.it"],
    mode: "public_pages",
    note: "Публичные страницы; ограниченная выборка с первого списка.",
  },
  {
    id: "nofluffjobs",
    hosts: ["nofluffjobs.com", "entrypoint-prod.nofluffjobs.com"],
    mode: "public_pages",
    note: "Публичные структурированные данные; описание может быть неполным.",
  },
  {
    id: "solidjobs",
    hosts: ["solid.jobs"],
    mode: "rss",
    note: "Публичная RSS-лента; только IT, описания сокращённые.",
  },
  {
    id: "olx",
    hosts: ["olx.pl", "www.olx.pl"],
    mode: "manual_import",
    note: "Страница вакансии вернула 403; Partner API читает только собственные объявления.",
  },
  {
    id: "pracuj",
    hosts: ["pracuj.pl", "www.pracuj.pl"],
    mode: "manual_import",
    note: "Публичный запрос не прошёл; автоматический сбор не подключён.",
  },
  {
    id: "bulldogjob",
    hosts: ["bulldogjob.pl"],
    mode: "public_pages",
    note: "Публичная страница Junior-вакансий и JobPosting; ограниченная выборка.",
  },
  {
    id: "theprotocol",
    hosts: ["theprotocol.it"],
    mode: "manual_import",
    note: "Публичный запрос не прошёл; автоматический сбор не подключён.",
  },
  {
    id: "indeed",
    hosts: ["pl.indeed.com", "www.indeed.com", "indeed.com"],
    mode: "manual_import",
    note: "Открытый поиск через API не подтверждён; партнёрские API не подключены.",
  },
  {
    id: "linkedin",
    hosts: ["www.linkedin.com", "pl.linkedin.com", "linkedin.com"],
    mode: "manual_import",
    note: "API полного поиска не подключён; нужен отдельный доступ/способ интеграции.",
  },
] as const;
