{{/*
Expand the name of the chart.
*/}}
{{- define "nats-jetstream-manager.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "nats-jetstream-manager.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "nats-jetstream-manager.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nats-jetstream-manager.labels" -}}
helm.sh/chart: {{ include "nats-jetstream-manager.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "nats-jetstream-manager.name" . }}
{{- end }}

{{/*
Backend labels
*/}}
{{- define "nats-jetstream-manager.backend.labels" -}}
{{ include "nats-jetstream-manager.labels" . }}
{{ include "nats-jetstream-manager.backend.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.backend.image.tag | default .Chart.AppVersion | quote }}
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "nats-jetstream-manager.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nats-jetstream-manager.name" . }}-backend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "nats-jetstream-manager.frontend.labels" -}}
{{ include "nats-jetstream-manager.labels" . }}
{{ include "nats-jetstream-manager.frontend.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.frontend.image.tag | default .Chart.AppVersion | quote }}
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "nats-jetstream-manager.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nats-jetstream-manager.name" . }}-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "nats-jetstream-manager.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "nats-jetstream-manager.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Backend secret name
*/}}
{{- define "nats-jetstream-manager.backend.secretName" -}}
{{- if .Values.backend.secrets.existingSecret }}
{{- .Values.backend.secrets.existingSecret }}
{{- else }}
{{- include "nats-jetstream-manager.fullname" . }}-backend
{{- end }}
{{- end }}

{{/*
Compute CORS_ORIGINS from ingress config or fallback to backend service URL.
*/}}
{{- define "nats-jetstream-manager.corsOrigins" -}}
{{- if and .Values.ingress.enabled .Values.ingress.frontend.host }}
{{- $scheme := "http" }}
{{- if .Values.ingress.frontend.tls }}
{{- $scheme = "https" }}
{{- end }}
{{- printf "%s://%s" $scheme .Values.ingress.frontend.host }}
{{- else }}
{{- printf "http://%s-frontend.%s.svc.cluster.local:%d" (include "nats-jetstream-manager.fullname" .) .Release.Namespace (int .Values.frontend.service.port) }}
{{- end }}
{{- end }}

{{/*
Backend image
*/}}
{{- define "nats-jetstream-manager.backend.image" -}}
{{- printf "%s:%s" .Values.backend.image.repository (.Values.backend.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/*
Frontend image
*/}}
{{- define "nats-jetstream-manager.frontend.image" -}}
{{- printf "%s:%s" .Values.frontend.image.repository (.Values.frontend.image.tag | default .Chart.AppVersion) }}
{{- end }}
