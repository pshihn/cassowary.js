// Copyright (C) 1998-2000 Greg J. Badros
// Use of this source code is governed by the LGPL, which can be found in the
// COPYING.LGPL file.
//
// Parts Copyright (C) 2011, Alex Rusell (slightlyoff@chromium.org)

(function(c) {

c.Tableau = c.inherit(
  function() {
    /* FIELDS:
        var _columns //Hashtable of vars -> set of vars
        var _rows //Hashtable of vars -> expr
        var _infeasibleRows //Set of vars
        var _externalRows //Set of vars
        var _externalParametricVars //Set of vars
   */
    this._columns = new Hashtable(); // values are sets
    this._rows = new Hashtable(); // values are ClLinearExpressions
    this._infeasibleRows = new HashSet();
    this._externalRows = new HashSet();
    this._externalParametricVars = new HashSet();
  },
  null,
  {
    noteRemovedVariable: function(v /*ClAbstractVariable*/, subject /*ClAbstractVariable*/) {
      if (c.fVerboseTraceOn) c.fnenterprint("noteRemovedVariable: " + v + ", " + subject);
      if (subject != null) {
        this._columns.get(v).remove(subject);
      }
    },

    noteAddedVariable: function(v /*ClAbstractVariable*/, subject /*ClAbstractVariable*/) {
      if (c.fVerboseTraceOn) c.fnenterprint("noteAddedVariable: " + v + ", " + subject);
      if (subject) {
        this.insertColVar(v, subject);
      }
    },

    getInternalInfo: function() {
      var retstr = "Tableau Information:\n";
      retstr += "Rows: " + this._rows.size();
      retstr += " (= " + (this._rows.size() - 1) + " constraints)";
      retstr += "\nColumns: " + this._columns.size();
      retstr += "\nInfeasible Rows: " + this._infeasibleRows.size();
      retstr += "\nExternal basic variables: " + this._externalRows.size();
      retstr += "\nExternal parametric variables: ";
      retstr += this._externalParametricVars.size();
      retstr += "\n";
      return retstr;
    },

    toString: function() {
      var bstr = "Tableau:\n";
      this._rows.each(function(clv, expr) {
        bstr += clv;
        bstr += " <==> ";
        bstr += expr;
        bstr += "\n";
      });
      bstr += "\nColumns:\n";
      bstr += c.hashToString(this._columns);
      bstr += "\nInfeasible rows: ";
      bstr += c.setToString(this._infeasibleRows);
      bstr += "External basic variables: ";
      bstr += c.setToString(this._externalRows);
      bstr += "External parametric variables: ";
      bstr += c.setToString(this._externalParametricVars);
      return bstr;
    },

    // Convenience function to insert a variable into
    // the set of rows stored at _columns[param_var],
    // creating a new set if needed
    insertColVar: function(param_var /*ClAbstractVariable*/, rowvar /*ClAbstractVariable*/) {
      var rowset = /* Set */this._columns.get(param_var);
      if (!rowset) 
        this._columns.put(param_var, rowset = new HashSet());
      rowset.add(rowvar);
      /*
      print("rowvar =" + rowvar);
      print("rowset = " + c.setToString(rowset));
      print("this._columns = " + c.hashToString(this._columns));
      */
    },

    addRow: function(aVar /*ClAbstractVariable*/, expr /*ClLinearExpression*/) {
      var that = this;
      if (c.fTraceOn) c.fnenterprint("addRow: " + aVar + ", " + expr);
      // print("addRow: " + aVar + " (key), " + expr + " (value)");
      // print(this._rows.size());
      this._rows.put(aVar, expr);
      expr.terms().each(function(clv, coeff) {
        // print("insertColVar(" + clv + ", " + aVar + ")");
        that.insertColVar(clv, aVar);
        if (clv.isExternal) {
          that._externalParametricVars.add(clv);
          // print("External parametric variables added to: " + 
          //       c.setToString(that._externalParametricVars));
        }
      });
      if (aVar.isExternal) {
        this._externalRows.add(aVar);
      }
      if (c.fTraceOn) c.traceprint(this.toString());
    },

    removeColumn: function(aVar /*ClAbstractVariable*/) {
      var that = this;
      if (c.fTraceOn) c.fnenterprint("removeColumn:" + aVar);
      var rows = /* Set */ this._columns.remove(aVar);
      if (rows) {
        rows.each(function(clv) {
          var expr = /* ClLinearExpression */that._rows.get(clv);
          expr.terms().remove(aVar);
        });
      } else {
        if (c.fTraceOn) c.debugprint("Could not find var " + aVar + " in _columns");
      }
      if (aVar.isExternal) {
        this._externalRows.remove(aVar);
        this._externalParametricVars.remove(aVar);
      }
    },

    removeRow: function(aVar /*ClAbstractVariable*/) {
      var that = this;
      if (c.fTraceOn) c.fnenterprint("removeRow:" + aVar);
      var expr = /* ClLinearExpression */this._rows.get(aVar);
      c.Assert(expr != null);
      expr.terms().each(function(clv, coeff) {
        var varset = that._columns.get(clv);
        if (varset != null) {
          if (c.fTraceOn) c.debugprint("removing from varset " + aVar);
          varset.remove(aVar);
        }
      });
      this._infeasibleRows.remove(aVar);
      if (aVar.isExternal) {
        this._externalRows.remove(aVar);
      }
      this._rows.remove(aVar);
      if (c.fTraceOn) c.fnexitprint("returning " + expr);
      return expr;
    },

    substituteOut: function(oldVar /*ClAbstractVariable*/, expr /*ClLinearExpression*/) {
      var that = this;
      if (c.fTraceOn) c.fnenterprint("substituteOut:" + oldVar + ", " + expr);
      if (c.fTraceOn) c.traceprint(this.toString());
      var varset = /* Set */this._columns.get(oldVar);
      varset.each(function(v) {
        var row = /* ClLinearExpression */that._rows.get(v);
        row.substituteOut(oldVar, expr, v, that);
        if (v.isRestricted && row.constant < 0.0) {
          that._infeasibleRows.add(v);
        }
      });
      if (oldVar.isExternal) {
        this._externalRows.add(oldVar);
        this._externalParametricVars.remove(oldVar);
      }
      this._columns.remove(oldVar);
    },

    columns: function() {
      return this._columns;
    },

    rows: function() {
      return this._rows;
    },

    columnsHasKey: function(subject /*ClAbstractVariable*/) {
      return (this._columns.get(subject) != null);
    },

    rowExpression: function(v /*ClAbstractVariable*/) {
      return /* ClLinearExpression */this._rows.get(v);
    },
  }
);

})(CL);
