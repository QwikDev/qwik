use std::collections::{HashMap, HashSet};

use swc_common::{errors::DiagnosticId, sync::Lrc, SourceMap, Span};

use crate::transform::{QwikTransform, QwikTransformOptions};

const QWIK_DISABLE_NEXT_LINE_DIRECTIVE: &str = "@qwik-disable-next-line";

pub(super) type DisabledDiagnostics = HashMap<usize, HashSet<String>>;

impl<'a> QwikTransform<'a> {
	pub(super) fn collect_disabled_diagnostics(
		options: &QwikTransformOptions<'a>,
	) -> DisabledDiagnostics {
		let Some(comments) = options.comments else {
			return HashMap::new();
		};

		let mut disabled = HashMap::new();
		let (mut leading, mut trailing) = comments.borrow_all_mut();
		Self::collect_disabled_diagnostics_from_map(&mut leading, &options.cm, &mut disabled);
		Self::collect_disabled_diagnostics_from_map(&mut trailing, &options.cm, &mut disabled);
		disabled
	}

	fn collect_disabled_diagnostics_from_map(
		comments_map: &mut swc_common::comments::SingleThreadedCommentsMapInner,
		source_map: &Lrc<SourceMap>,
		disabled: &mut DisabledDiagnostics,
	) {
		for comments in comments_map.values_mut() {
			comments.retain(|comment| {
				let Some(rules) = Self::parse_disable_next_line_directive(comment.text.as_ref())
				else {
					return true;
				};

				if !rules.is_empty() {
					let next_line = source_map.lookup_char_pos(comment.span.hi).line + 1;
					disabled.entry(next_line).or_default().extend(rules);
				}

				false
			});
		}
	}

	fn parse_disable_next_line_directive(comment: &str) -> Option<HashSet<String>> {
		for line in comment.lines() {
			let line = line.trim_start_matches(['*', ' ']).trim();
			let Some(rest) = line.strip_prefix(QWIK_DISABLE_NEXT_LINE_DIRECTIVE) else {
				continue;
			};

			let rules = rest
				.split(',')
				.map(str::trim)
				.filter(|rule| !rule.is_empty())
				.map(ToOwned::to_owned)
				.collect();
			return Some(rules);
		}

		None
	}

	fn lookup_disabled_diagnostics(&self, span: Span) -> Option<&HashSet<String>> {
		if span.lo.is_dummy() {
			return None;
		}

		let line = self.options.cm.lookup_char_pos(span.lo).line;
		self.disabled_diagnostics.get(&line)
	}

	pub(super) fn is_diagnostic_disabled(&self, span: Span, code: &str) -> bool {
		self.lookup_disabled_diagnostics(span)
			.is_some_and(|rules| rules.contains(code))
	}

	pub(super) fn emit_span_warning_with_code(&self, span: Span, message: &str, code: &str) {
		if self.is_diagnostic_disabled(span, code) {
			return;
		}

		swc_common::errors::HANDLER.with(|handler| {
			handler
				.struct_span_warn_with_code(span, message, DiagnosticId::Error(code.into()))
				.emit();
		});
	}

	pub(super) fn emit_span_error_with_code(&self, span: Span, message: &str, code: &str) {
		if self.is_diagnostic_disabled(span, code) {
			return;
		}

		swc_common::errors::HANDLER.with(|handler| {
			handler
				.struct_span_err_with_code(span, message, DiagnosticId::Error(code.into()))
				.emit();
		});
	}

	pub(super) fn emit_error_with_code(&self, suppression_span: Span, message: &str, code: &str) {
		if self.is_diagnostic_disabled(suppression_span, code) {
			return;
		}

		swc_common::errors::HANDLER.with(|handler| {
			handler
				.struct_err_with_code(message, DiagnosticId::Error(code.into()))
				.emit();
		});
	}
}
