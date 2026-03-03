package prismer

import "encoding/json"

// ============================================================================
// Shared Types
// ============================================================================

// APIError represents an API error.
// It handles both object {"code":"...", "message":"..."} and plain string formats.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	if e.Code != "" {
		return e.Code + ": " + e.Message
	}
	return e.Message
}

// UnmarshalJSON handles both string and object error formats from the API.
func (e *APIError) UnmarshalJSON(data []byte) error {
	// Try string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		e.Code = "ERROR"
		e.Message = s
		return nil
	}
	// Fall back to object
	type alias APIError
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	*e = APIError(a)
	return nil
}

// ============================================================================
// Context API Types
// ============================================================================

type LoadOptions struct {
	InputType       string         `json:"inputType,omitempty"`
	ProcessUncached bool           `json:"processUncached,omitempty"`
	Search          *SearchConfig  `json:"search,omitempty"`
	Processing      *ProcessConfig `json:"processing,omitempty"`
	Return          *ReturnConfig  `json:"return,omitempty"`
	Ranking         *RankingConfig `json:"ranking,omitempty"`
}

type SearchConfig struct {
	TopK int `json:"topK,omitempty"`
}

type ProcessConfig struct {
	Strategy      string `json:"strategy,omitempty"`
	MaxConcurrent int    `json:"maxConcurrent,omitempty"`
}

type ReturnConfig struct {
	Format string `json:"format,omitempty"`
	TopK   int    `json:"topK,omitempty"`
}

type RankingConfig struct {
	Preset string              `json:"preset,omitempty"`
	Custom *RankingCustomConfig `json:"custom,omitempty"`
}

type RankingCustomConfig struct {
	CacheHit  float64 `json:"cacheHit,omitempty"`
	Relevance float64 `json:"relevance,omitempty"`
	Freshness float64 `json:"freshness,omitempty"`
	Quality   float64 `json:"quality,omitempty"`
}

type LoadResult struct {
	Success        bool             `json:"success"`
	RequestID      string           `json:"requestId,omitempty"`
	Mode           string           `json:"mode,omitempty"`
	Result         *LoadResultItem  `json:"result,omitempty"`
	Results        []LoadResultItem `json:"results,omitempty"`
	Summary        map[string]any   `json:"summary,omitempty"`
	Cost           map[string]any   `json:"cost,omitempty"`
	ProcessingTime int              `json:"processingTime,omitempty"`
	Error          *APIError        `json:"error,omitempty"`
}

type LoadResultItem struct {
	Rank      int            `json:"rank,omitempty"`
	URL       string         `json:"url"`
	Title     string         `json:"title,omitempty"`
	HQCC      string         `json:"hqcc,omitempty"`
	Raw       string         `json:"raw,omitempty"`
	Cached    bool           `json:"cached"`
	CachedAt  string         `json:"cachedAt,omitempty"`
	Processed bool           `json:"processed,omitempty"`
	Found     bool           `json:"found,omitempty"`
	Error     string         `json:"error,omitempty"`
	Ranking   *RankingInfo   `json:"ranking,omitempty"`
	Meta      map[string]any `json:"meta,omitempty"`
}

type RankingInfo struct {
	Score   float64        `json:"score"`
	Factors RankingFactors `json:"factors,omitempty"`
}

type RankingFactors struct {
	Cache     float64 `json:"cache"`
	Relevance float64 `json:"relevance"`
	Freshness float64 `json:"freshness"`
	Quality   float64 `json:"quality"`
}

type SaveOptions struct {
	URL        string         `json:"url"`
	HQCC       string         `json:"hqcc"`
	Raw        string         `json:"raw,omitempty"`
	Visibility string         `json:"visibility,omitempty"`
	Meta       map[string]any `json:"meta,omitempty"`
}

type SaveBatchOptions struct {
	Items []SaveOptions `json:"items"`
}

type SaveResult struct {
	Success bool             `json:"success"`
	Status  string           `json:"status,omitempty"`
	URL     string           `json:"url,omitempty"`
	Results []SaveResultItem `json:"results,omitempty"`
	Summary *SaveSummary     `json:"summary,omitempty"`
	Error   *APIError        `json:"error,omitempty"`
}

type SaveResultItem struct {
	URL    string `json:"url"`
	Status string `json:"status"`
}

type SaveSummary struct {
	Total   int `json:"total"`
	Created int `json:"created"`
	Exists  int `json:"exists"`
}

// ============================================================================
// Parse API Types
// ============================================================================

type ParseOptions struct {
	URL       string `json:"url,omitempty"`
	Base64    string `json:"base64,omitempty"`
	Filename  string `json:"filename,omitempty"`
	Mode      string `json:"mode,omitempty"`
	Output    string `json:"output,omitempty"`
	ImageMode string `json:"image_mode,omitempty"`
	Wait      *bool  `json:"wait,omitempty"`
}

type ParseDocument struct {
	Markdown      string         `json:"markdown,omitempty"`
	Text          string         `json:"text,omitempty"`
	PageCount     int            `json:"pageCount"`
	Metadata      map[string]any `json:"metadata,omitempty"`
	Images        []ParseImage   `json:"images,omitempty"`
	EstimatedTime int            `json:"estimatedTime,omitempty"`
}

type ParseImage struct {
	Page    int    `json:"page"`
	URL     string `json:"url"`
	Caption string `json:"caption,omitempty"`
}

type ParseUsage struct {
	InputPages   int `json:"inputPages"`
	InputImages  int `json:"inputImages"`
	OutputChars  int `json:"outputChars"`
	OutputTokens int `json:"outputTokens"`
}

type ParseCostBreakdown struct {
	Pages  float64 `json:"pages"`
	Images float64 `json:"images"`
}

type ParseCost struct {
	Credits   float64             `json:"credits"`
	Breakdown *ParseCostBreakdown `json:"breakdown,omitempty"`
}

type ParseEndpoints struct {
	Status string `json:"status"`
	Result string `json:"result"`
	Stream string `json:"stream"`
}

type ParseResult struct {
	Success        bool            `json:"success"`
	RequestID      string          `json:"requestId,omitempty"`
	Mode           string          `json:"mode,omitempty"`
	Async          bool            `json:"async,omitempty"`
	Document       *ParseDocument  `json:"document,omitempty"`
	Usage          *ParseUsage     `json:"usage,omitempty"`
	Cost           *ParseCost      `json:"cost,omitempty"`
	TaskID         string          `json:"taskId,omitempty"`
	Status         string          `json:"status,omitempty"`
	Endpoints      *ParseEndpoints `json:"endpoints,omitempty"`
	ProcessingTime int             `json:"processingTime,omitempty"`
	Error          *APIError       `json:"error,omitempty"`
}

// SearchOptions configures a search query.
type SearchOptions struct {
	TopK       int
	ReturnTopK int
	Format     string
	Ranking    string
}

// ============================================================================
// IM API Types
// ============================================================================

type IMRegisterOptions struct {
	Type         string   `json:"type"`
	Username     string   `json:"username"`
	DisplayName  string   `json:"displayName"`
	AgentType    string   `json:"agentType,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	Description  string   `json:"description,omitempty"`
	Endpoint     string   `json:"endpoint,omitempty"`
}

type IMRegisterData struct {
	IMUserID     string   `json:"imUserId"`
	Username     string   `json:"username"`
	DisplayName  string   `json:"displayName"`
	Role         string   `json:"role"`
	Token        string   `json:"token"`
	ExpiresIn    string   `json:"expiresIn"`
	Capabilities []string `json:"capabilities,omitempty"`
	IsNew        bool     `json:"isNew"`
}

type IMUser struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	AgentType   string `json:"agentType,omitempty"`
}

type IMAgentCard struct {
	AgentType    string   `json:"agentType"`
	Capabilities []string `json:"capabilities"`
	Description  string   `json:"description,omitempty"`
	Status       string   `json:"status"`
}

type IMStats struct {
	ConversationCount int `json:"conversationCount"`
	DirectCount       int `json:"directCount,omitempty"`
	GroupCount        int `json:"groupCount,omitempty"`
	ContactCount      int `json:"contactCount"`
	MessagesSent      int `json:"messagesSent"`
	UnreadCount       int `json:"unreadCount"`
}

type IMBindingInfo struct {
	Platform     string `json:"platform"`
	Status       string `json:"status"`
	ExternalName string `json:"externalName,omitempty"`
}

type IMCreditsInfo struct {
	Balance    float64 `json:"balance"`
	TotalSpent float64 `json:"totalSpent"`
}

type IMMeData struct {
	User      IMUser          `json:"user"`
	AgentCard *IMAgentCard    `json:"agentCard,omitempty"`
	Stats     IMStats         `json:"stats"`
	Bindings  []IMBindingInfo `json:"bindings"`
	Credits   IMCreditsInfo   `json:"credits"`
}

type IMTokenData struct {
	Token     string `json:"token"`
	ExpiresIn string `json:"expiresIn"`
}

type IMMessage struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversationId,omitempty"`
	Content        string          `json:"content"`
	Type           string          `json:"type"`
	SenderID       string          `json:"senderId"`
	ParentID       *string         `json:"parentId,omitempty"`
	Status         string          `json:"status,omitempty"`
	CreatedAt      string          `json:"createdAt"`
	UpdatedAt      string          `json:"updatedAt,omitempty"`
	Metadata       json.RawMessage `json:"metadata,omitempty"`
}

type IMRoutingTarget struct {
	UserID   string `json:"userId"`
	Username string `json:"username,omitempty"`
}

type IMRouting struct {
	Mode    string            `json:"mode"`
	Targets []IMRoutingTarget `json:"targets"`
}

type IMMessageData struct {
	ConversationID string     `json:"conversationId"`
	Message        IMMessage  `json:"message"`
	Routing        *IMRouting `json:"routing,omitempty"`
}

type IMGroupMember struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName,omitempty"`
	Role        string `json:"role"`
}

type IMGroupData struct {
	GroupID     string          `json:"groupId"`
	Title       string          `json:"title"`
	Description string          `json:"description,omitempty"`
	Members     []IMGroupMember `json:"members"`
}

type IMContact struct {
	Username       string `json:"username"`
	DisplayName    string `json:"displayName"`
	Role           string `json:"role"`
	LastMessageAt  string `json:"lastMessageAt,omitempty"`
	UnreadCount    int    `json:"unreadCount"`
	ConversationID string `json:"conversationId"`
}

type IMDiscoverAgent struct {
	Username     string   `json:"username"`
	DisplayName  string   `json:"displayName"`
	AgentType    string   `json:"agentType,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	Status       string   `json:"status"`
}

type IMBindingData struct {
	BindingID        string `json:"bindingId"`
	Platform         string `json:"platform"`
	Status           string `json:"status"`
	VerificationCode string `json:"verificationCode"`
}

type IMBinding struct {
	BindingID    string `json:"bindingId"`
	Platform     string `json:"platform"`
	Status       string `json:"status"`
	ExternalName string `json:"externalName,omitempty"`
}

type IMCreditsData struct {
	Balance     float64 `json:"balance"`
	TotalEarned float64 `json:"totalEarned"`
	TotalSpent  float64 `json:"totalSpent"`
}

type IMTransaction struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	Amount       float64 `json:"amount"`
	BalanceAfter float64 `json:"balanceAfter"`
	Description  string  `json:"description"`
	CreatedAt    string  `json:"createdAt"`
}

type IMConversation struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Title       string          `json:"title,omitempty"`
	LastMessage *IMMessage      `json:"lastMessage,omitempty"`
	UnreadCount int             `json:"unreadCount,omitempty"`
	Members     []IMGroupMember `json:"members,omitempty"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt,omitempty"`
}

type IMWorkspaceData struct {
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`
}

type IMAutocompleteResult struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}

type IMWorkspaceInitOptions struct {
	WorkspaceID     string `json:"workspaceId"`
	UserID          string `json:"userId"`
	UserDisplayName string `json:"userDisplayName"`
}

type IMWorkspaceInitGroupUser struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
}

type IMWorkspaceInitGroupOptions struct {
	WorkspaceID string                     `json:"workspaceId"`
	Title       string                     `json:"title"`
	Users       []IMWorkspaceInitGroupUser `json:"users"`
}

type IMCreateGroupOptions struct {
	Title       string         `json:"title"`
	Description string         `json:"description,omitempty"`
	Members     []string       `json:"members,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type IMCreateBindingOptions struct {
	Platform  string `json:"platform"`
	BotToken  string `json:"botToken"`
	ChatID    string `json:"chatId,omitempty"`
	ChannelID string `json:"channelId,omitempty"`
}

type IMSendOptions struct {
	Type     string         `json:"type,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
	ParentID string         `json:"parentId,omitempty"`
}

type IMPaginationOptions struct {
	Limit  int
	Offset int
}

type IMDiscoverOptions struct {
	Type       string
	Capability string
}

// ============================================================================
// IM File Upload Types
// ============================================================================

// IMPresignOptions configures a presigned upload URL request.
type IMPresignOptions struct {
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	MimeType string `json:"mimeType"`
}

// IMPresignResult is the response from a presign request.
type IMPresignResult struct {
	UploadID  string            `json:"uploadId"`
	URL       string            `json:"url"`
	Fields    map[string]string `json:"fields"`
	ExpiresAt string            `json:"expiresAt"`
}

// IMConfirmResult is the response from a confirm request.
type IMConfirmResult struct {
	UploadID string  `json:"uploadId"`
	CdnURL   string  `json:"cdnUrl"`
	FileName string  `json:"fileName"`
	FileSize int64   `json:"fileSize"`
	MimeType string  `json:"mimeType"`
	SHA256   *string `json:"sha256"`
	Cost     float64 `json:"cost"`
}

// IMFileQuota is the response from a quota request.
type IMFileQuota struct {
	Used      int64  `json:"used"`
	Limit     int64  `json:"limit"`
	Tier      string `json:"tier"`
	FileCount int    `json:"fileCount"`
}

// IMMultipartPart represents a part URL in a multipart upload init response.
type IMMultipartPart struct {
	PartNumber int    `json:"partNumber"`
	URL        string `json:"url"`
}

// IMMultipartInitResult is the response from a multipart init request.
type IMMultipartInitResult struct {
	UploadID  string            `json:"uploadId"`
	Parts     []IMMultipartPart `json:"parts"`
	ExpiresAt string            `json:"expiresAt"`
}

// IMCompletedPart represents a completed part for multipart complete.
type IMCompletedPart struct {
	PartNumber int    `json:"partNumber"`
	ETag       string `json:"etag"`
}

// UploadOptions configures a high-level file upload.
type UploadOptions struct {
	FileName   string
	MimeType   string
	OnProgress func(uploaded, total int64)
}

// SendFileOptions configures a high-level send-file operation.
type SendFileOptions struct {
	FileName   string
	MimeType   string
	Content    string // Message content (defaults to fileName)
	ParentID   string
	OnProgress func(uploaded, total int64)
}

// SendFileResult contains the upload result and message data.
type SendFileResult struct {
	Upload  *IMConfirmResult
	Message json.RawMessage
}

// IMResult is the generic IM API response.
type IMResult struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data,omitempty"`
	Meta  map[string]any  `json:"meta,omitempty"`
	Error *APIError       `json:"error,omitempty"`
}

// Decode unmarshals the Data field into the provided type.
func (r *IMResult) Decode(v interface{}) error {
	if r.Data == nil {
		return nil
	}
	return json.Unmarshal(r.Data, v)
}
