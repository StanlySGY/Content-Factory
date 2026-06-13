import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBar } from "../../components/states.js";
import "./quick-create.css";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  estimatedTime: string;
  targetLength: string;
}

interface TitleSuggestion {
  title: string;
  reason: string;
}

export function QuickCreatePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [wordCount, setWordCount] = useState("1500-2000");
  const [style, setStyle] = useState("professional");
  const [titleSuggestions, setTitleSuggestions] = useState<TitleSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 加载模板列表
  useEffect(() => {
    fetch("/api/workflow-definitions?status=active")
      .then((res) => res.json())
      .then((data) => {
        const formattedTemplates = data.map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.definition_schema.description,
          tags: t.definition_schema.tags || [],
          estimatedTime: t.definition_schema.estimatedTime,
          targetLength: t.definition_schema.targetLength,
        }));
        setTemplates(formattedTemplates);
        if (formattedTemplates.length > 0) {
          setSelectedTemplate(formattedTemplates[0].id);
        }
      })
      .catch((err) => setError(`加载模板失败：${err.message}`));
  }, []);

  // 智能推荐标题
  useEffect(() => {
    if (keywords.length === 0 || selectedTemplate === "") return;

    const timer = setTimeout(() => {
      setIsLoadingSuggestions(true);
      // TODO: 调用 AI API 生成标题建议
      // 暂时使用模拟数据
      const mockSuggestions: TitleSuggestion[] = [
        {
          title: `${keywords[0]}的3个误区，90%的人都不知道`,
          reason: "数字 + 痛点 + 悬念，点击率高"
        },
        {
          title: `我用${keywords[0]}一个月，发现了这些规律`,
          reason: "第一人称 + 具体时间 + 价值承诺"
        },
        {
          title: `${keywords[0]}完全指南：从入门到精通`,
          reason: "系统性 + 权威感，适合教程类"
        }
      ];

      setTimeout(() => {
        setTitleSuggestions(mockSuggestions);
        setIsLoadingSuggestions(false);
      }, 800);
    }, 500);

    return () => clearTimeout(timer);
  }, [keywords, selectedTemplate]);

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim();
    if (keyword && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword]);
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("请输入标题");
      return;
    }

    if (keywords.length === 0) {
      setError("请至少添加一个关键词");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // 创建任务
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content_type: "article",
          priority: "normal",
          requirement_data: {
            workflow_template_id: selectedTemplate,
            keywords,
            word_count: wordCount,
            writing_style: style,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("创建任务失败");
      }

      const task = await response.json();
      navigate(`/tasks/${task.id}`);
    } catch (err: any) {
      setError(err.message || "创建失败，请重试");
      setIsSubmitting(false);
    }
  };

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="container" style={{ maxWidth: "800px", margin: "0 auto" }}>
      <div className="page-head">
        <h1>📝 快速创建文章</h1>
        <p>填写基本信息，系统将自动生成文章初稿</p>
      </div>

      {error && <ErrorBar message={error} />}

      <form onSubmit={handleSubmit} className="quick-create-form">
        {/* 选择模板 */}
        <div className="form-group">
          <label htmlFor="template">文章类型 *</label>
          <div className="template-selector">
            {templates.map((template) => (
              <div
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? "selected" : ""}`}
                onClick={() => setSelectedTemplate(template.id)}
              >
                <div className="template-name">{template.name}</div>
                <div className="template-desc">{template.description}</div>
                <div className="template-meta">
                  {template.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                  <span className="meta-info">
                    ⏱️ {template.estimatedTime} · 📏 {template.targetLength}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 标题输入 */}
        <div className="form-group">
          <label htmlFor="title">文章标题 *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入标题，或从下方建议中选择"
            className="input-large"
            autoFocus
          />
        </div>

        {/* AI 标题建议 */}
        {titleSuggestions.length > 0 && (
          <div className="title-suggestions">
            <div className="suggestions-header">
              💡 智能推荐标题
              {isLoadingSuggestions && <span className="loading-dot">加载中...</span>}
            </div>
            {titleSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="suggestion-item"
                onClick={() => setTitle(suggestion.title)}
              >
                <div className="suggestion-title">{suggestion.title}</div>
                <div className="suggestion-reason">{suggestion.reason}</div>
              </div>
            ))}
          </div>
        )}

        {/* 关键词 */}
        <div className="form-group">
          <label htmlFor="keywords">关键词 *</label>
          <div className="keyword-input-group">
            <input
              id="keywords"
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddKeyword();
                }
              }}
              placeholder="输入关键词后按回车添加"
            />
            <button type="button" onClick={handleAddKeyword} className="button">
              添加
            </button>
          </div>
          {keywords.length > 0 && (
            <div className="keyword-list">
              {keywords.map((keyword) => (
                <span key={keyword} className="keyword-tag">
                  #{keyword}
                  <button
                    type="button"
                    onClick={() => handleRemoveKeyword(keyword)}
                    className="remove-btn"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 字数要求 */}
        <div className="form-group">
          <label htmlFor="wordCount">字数要求</label>
          <select
            id="wordCount"
            value={wordCount}
            onChange={(e) => setWordCount(e.target.value)}
          >
            <option value="800-1200">800-1200 字（短文）</option>
            <option value="1500-2000">1500-2000 字（标准）</option>
            <option value="2500-3000">2500-3000 字（长文）</option>
            <option value="3500-5000">3500-5000 字（深度）</option>
          </select>
        </div>

        {/* 写作风格 */}
        <div className="form-group">
          <label htmlFor="style">写作风格</label>
          <div className="style-selector">
            <label className={`style-option ${style === "professional" ? "selected" : ""}`}>
              <input
                type="radio"
                name="style"
                value="professional"
                checked={style === "professional"}
                onChange={(e) => setStyle(e.target.value)}
              />
              <span className="style-label">专业</span>
              <span className="style-desc">严谨、权威、数据支撑</span>
            </label>
            <label className={`style-option ${style === "casual" ? "selected" : ""}`}>
              <input
                type="radio"
                name="style"
                value="casual"
                checked={style === "casual"}
                onChange={(e) => setStyle(e.target.value)}
              />
              <span className="style-label">轻松</span>
              <span className="style-desc">亲切、口语化、易读</span>
            </label>
            <label className={`style-option ${style === "humorous" ? "selected" : ""}`}>
              <input
                type="radio"
                name="style"
                value="humorous"
                checked={style === "humorous"}
                onChange={(e) => setStyle(e.target.value)}
              />
              <span className="style-label">幽默</span>
              <span className="style-desc">活泼、段子、网络梗</span>
            </label>
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="form-actions">
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="button"
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={isSubmitting || !selectedTemplate || !title.trim() || keywords.length === 0}
          >
            {isSubmitting ? "创建中..." : "开始生成文章"}
          </button>
        </div>
      </form>
    </div>
  );
}
